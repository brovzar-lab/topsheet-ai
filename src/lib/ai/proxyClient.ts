/**
 * LLM Proxy Client — TOPSHEET AI
 *
 * Routes all LLM calls through Firebase Cloud Function → LiteLLM.
 * Falls back to direct API calls when the proxy is unavailable:
 *   - Gemini models → Google Generative AI SDK
 *   - Claude models → raw fetch to Anthropic Messages API
 *
 * In dev:  http://127.0.0.1:5001/topsheet-ai/us-central1/llmProxy
 * In prod: /api/llm (Firebase Hosting rewrite)
 *
 * Prompt Caching
 * ─────────────
 * Set `cacheSystemPrompt: true` on any call with a large, stable system prompt
 * (Rafa / Sandra chats with the full screenplay injected). This adds
 * `cache_control: { type: "ephemeral" }` to the system block, which:
 *   • Anthropic / Claude: saves ~90% on cached input tokens (5-min TTL per write).
 *   • Gemini via LiteLLM: no-op — LiteLLM ignores unknown fields gracefully.
 */

import { GoogleGenerativeAI, HarmBlockThreshold, HarmCategory } from '@google/generative-ai';
import { getIdToken } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { useSettingsStore } from '@/stores/settings-store';

// Read API key from the live Zustand store (in-memory, always current).
// Falls back to parsing localStorage if hydration hasn't completed yet.
function getStoredApiKey(provider: 'gemini' | 'anthropic'): string {
  // Primary: read from Zustand store's current in-memory state
  try {
    const state = useSettingsStore.getState();
    const key = provider === 'gemini' ? state.geminiApiKey : state.anthropicApiKey;
    if (key) return key;
  } catch {
    // Store not initialized yet — fall through
  }

  // Fallback: parse localStorage directly (early boot / SSR)
  try {
    const raw = localStorage.getItem('topsheet-settings');
    if (!raw) return '';
    const parsed = JSON.parse(raw) as { state?: { geminiApiKey?: string; anthropicApiKey?: string } };
    return provider === 'gemini'
      ? (parsed.state?.geminiApiKey ?? '')
      : (parsed.state?.anthropicApiKey ?? '');
  } catch {
    return '';
  }
}

// In dev: use the deployed production Cloud Function directly.
// This means local dev works with just `npm run dev` — no emulator needed.
// Your Google auth token (from Firebase) is valid against the production function.
// Set VITE_USE_EMULATOR=true in .env.local only when actively developing the function itself.
const PROXY_URL = import.meta.env.VITE_USE_EMULATOR === 'true'
  ? 'http://127.0.0.1:5001/topsheet-ai/us-central1/llmProxy'
  : import.meta.env.DEV
    ? 'https://us-central1-topsheet-ai.cloudfunctions.net/llmProxy'
    : '/api/llm';

export interface LLMRequest {
  model: string;
  prompt: string;
  systemPrompt?: string;
  /** Request JSON output from the model */
  jsonMode?: boolean;
  temperature?: number;
  maxTokens?: number;
  /**
   * When true, marks the system prompt with Anthropic's
   * `cache_control: { type: "ephemeral" }` so repeated turns reuse the
   * cached KV prefix (~90% cheaper on cached tokens, up to 2× faster).
   *
   * Use for Rafa / Sandra chats where the large screenplay-injected system
   * prompt is stable across all turns in a conversation.
   * No-op for Gemini models.
   */
  cacheSystemPrompt?: boolean;
  /**
   * For Gemini 2.5+ models: set to 0 to disable "thinking" phase,
   * which otherwise adds 30-90s latency on large prompts.
   * Defaults to 0 for chat interactions.
   */
  thinkingBudget?: number;
}

export interface LLMResponse {
  text: string;
  usage?: {
    input_tokens: number;
    output_tokens: number;
    /** Anthropic: tokens served from prompt cache (billed at ~10% of normal) */
    cache_read_tokens?: number;
    /** Anthropic: tokens written to prompt cache (billed at ~125% of normal, one-time) */
    cache_creation_tokens?: number;
  };
}

// -----------------------------------------------------------------------
// Proxy availability cache — with TTL so a single network blip does not
// permanently activate the key-exposure fallback for the entire session.
// After PROXY_RETRY_MS milliseconds the proxy will be retried.
// -----------------------------------------------------------------------

const PROXY_RETRY_MS = 60_000; // 60 s
let _proxyAvailable: boolean | null = null;
let _proxyFailedAt: number | null = null;

function isProxyDown(): boolean {
  if (_proxyAvailable !== false) return false;
  // Reset after TTL so transient outages don't permanently fall back
  if (_proxyFailedAt !== null && Date.now() - _proxyFailedAt > PROXY_RETRY_MS) {
    _proxyAvailable = null;
    _proxyFailedAt = null;
    return false;
  }
  return true;
}

// -----------------------------------------------------------------------
// Provider detection helpers
// -----------------------------------------------------------------------

function isClaudeModel(model: string): boolean {
  return model.startsWith('anthropic/') || model.startsWith('claude-');
}

function stripAnthropicPrefix(model: string): string {
  return model.startsWith('anthropic/') ? model.slice('anthropic/'.length) : model;
}

/**
 * LiteLLM aliases → real Gemini API model names.
 * Only needed for the direct-API fallback path.
 */
function resolveGeminiModel(model: string): string {
  switch (model) {
    case 'gemini-large-context':  return 'gemini-2.5-pro';
    case 'gemini-flash-fallback': return 'gemini-2.0-flash';
    default:                      return model;
  }
}

// -----------------------------------------------------------------------
// Direct Gemini fallback (used when proxy is unreachable)
// -----------------------------------------------------------------------

const SAFETY_SETTINGS = [
  { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_NONE },
  { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_NONE },
  { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_NONE },
  { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_NONE },
] as const;

let _cachedGeminiClient: { key: string; instance: GoogleGenerativeAI } | null = null;

function getGeminiClient(apiKey: string): GoogleGenerativeAI {
  if (_cachedGeminiClient?.key === apiKey) return _cachedGeminiClient.instance;
  const instance = new GoogleGenerativeAI(apiKey);
  _cachedGeminiClient = { key: apiKey, instance };
  return instance;
}

async function callGeminiDirect(options: LLMRequest): Promise<LLMResponse> {
  // Direct API calls embed keys in the browser bundle — only allowed in local dev.
  if (!import.meta.env.DEV) {
    throw new Error(
      'Direct Gemini fallback is disabled in production. ' +
      'Ensure the Firebase emulator or deployed Cloud Function is reachable.',
    );
  }
  // Check env var first, then fall back to key stored in Settings UI
  const apiKey = (import.meta.env.VITE_GEMINI_API_KEY as string | undefined) || getStoredApiKey('gemini');
  if (!apiKey) {
    throw new Error(
      'LLM proxy is unavailable and no Gemini API key is configured. ' +
      'Add your Gemini key in Settings → API Keys, or set VITE_GEMINI_API_KEY in .env.local',
    );
  }

  const genAI = getGeminiClient(apiKey);

  const generationConfig: Record<string, unknown> = {
    temperature: options.temperature ?? 0.7,
  };
  if (options.jsonMode) generationConfig.responseMimeType = 'application/json';
  if (options.maxTokens) generationConfig.maxOutputTokens = options.maxTokens;

  // Allow some thinking so the model can construct valid JSON with real IDs.
  // 0 = model can't reason at all (fails to produce [ACTIONS]).
  // 2048 = ~3-8s extra latency, but model can plan structured output.
  const thinkingBudget = options.thinkingBudget ?? 2048;
  generationConfig.thinkingConfig = { thinkingBudget };

  const model = genAI.getGenerativeModel({
    model: resolveGeminiModel(options.model),
    generationConfig,
    safetySettings: [...SAFETY_SETTINGS],
  });

  const result = options.systemPrompt
    ? await model.generateContent({
        contents: [{ role: 'user', parts: [{ text: options.prompt }] }],
        systemInstruction: { role: 'model', parts: [{ text: options.systemPrompt }] },
      })
    : await model.generateContent(options.prompt);

  return { text: result.response.text() };
}

// -----------------------------------------------------------------------
// Direct Claude fallback (raw fetch — no SDK dependency)
// -----------------------------------------------------------------------

async function callClaudeDirect(options: LLMRequest): Promise<LLMResponse> {
  // Direct API calls embed keys in the browser bundle — only allowed in local dev.
  if (!import.meta.env.DEV) {
    throw new Error(
      'Direct Anthropic fallback is disabled in production. ' +
      'Ensure the Firebase emulator or deployed Cloud Function is reachable.',
    );
  }
  // Check env var first, then fall back to key stored in Settings UI
  const envKey = import.meta.env.VITE_ANTHROPIC_API_KEY as string | undefined;
  const storedKey = getStoredApiKey('anthropic');
  const apiKey = envKey || storedKey;

  if (import.meta.env.DEV) {
    console.info('[proxyClient] Anthropic key sources — env:', !!envKey, 'store:', !!storedKey, 'final:', !!apiKey);
  }

  if (!apiKey) {
    throw new Error(
      'LLM proxy is unavailable and no Anthropic API key is configured. ' +
      'Add your Anthropic key in Settings → API Keys, or set VITE_ANTHROPIC_API_KEY in .env.local',
    );
  }

  // System prompt — use content-block array form so we can attach cache_control.
  // Anthropic requires the array form for prompt caching on the system field.
  type SystemBlock = { type: 'text'; text: string; cache_control?: { type: 'ephemeral' } };
  let systemField: string | SystemBlock[] | undefined;

  if (options.systemPrompt) {
    let sysText = options.systemPrompt;
    if (options.jsonMode) sysText += '\n\nYou must respond with valid JSON only. No markdown fences, no explanation.';
    systemField = [
      {
        type: 'text',
        text: sysText,
        ...(options.cacheSystemPrompt ? { cache_control: { type: 'ephemeral' } } : {}),
      },
    ];
  } else if (options.jsonMode) {
    systemField = 'You must respond with valid JSON only. No markdown fences, no explanation.';
  }

  const body: Record<string, unknown> = {
    model: stripAnthropicPrefix(options.model),
    max_tokens: options.maxTokens ?? 4096,
    messages: [{ role: 'user', content: options.prompt }],
    ...(systemField ? { system: systemField } : {}),
  };

  if (options.temperature !== undefined) body.temperature = options.temperature;

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`Anthropic error (${res.status}): ${errorText}`);
  }

  const data = await res.json();
  const text = data.content?.[0]?.text ?? '';

  return {
    text,
    usage: data.usage
      ? {
          input_tokens: data.usage.input_tokens ?? 0,
          output_tokens: data.usage.output_tokens ?? 0,
          cache_read_tokens: data.usage.cache_read_input_tokens ?? 0,
          cache_creation_tokens: data.usage.cache_creation_input_tokens ?? 0,
        }
      : undefined,
  };
}

// -----------------------------------------------------------------------
// Fallback dispatcher — routes by provider
// -----------------------------------------------------------------------

function callDirectFallback(options: LLMRequest): Promise<LLMResponse> {
  if (isClaudeModel(options.model)) {
    console.warn('[proxyClient] Proxy unavailable, falling back to direct Anthropic API');
    return callClaudeDirect(options);
  }
  console.warn('[proxyClient] Proxy unavailable, falling back to direct Gemini API');
  return callGeminiDirect(options);
}

// -----------------------------------------------------------------------
// Public API
// -----------------------------------------------------------------------

/**
 * Call an LLM through the server-side proxy.
 * Falls back to direct provider API if the proxy is unreachable.
 *
 * Set `cacheSystemPrompt: true` for large, stable system prompts to enable
 * Anthropic prompt caching (~90% cheaper on cached input tokens).
 */
export async function callLLM(options: LLMRequest): Promise<LLMResponse> {
  // If the proxy is known-down (within TTL), skip straight to direct fallback
  if (isProxyDown()) {
    return callDirectFallback(options);
  }

  // ── Build system content ────────────────────────────────────────────────
  // For Claude + cacheSystemPrompt: array form with cache_control so LiteLLM
  // forwards it to Anthropic verbatim. For Gemini: plain string.
  type SystemBlock = { type: 'text'; text: string; cache_control?: { type: 'ephemeral' } };

  const useCache = options.cacheSystemPrompt && isClaudeModel(options.model);
  let systemField: string | SystemBlock[] | undefined;

  if (options.systemPrompt) {
    let sysText = options.systemPrompt;
    if (options.jsonMode && isClaudeModel(options.model)) {
      sysText += '\n\nYou must respond with valid JSON only. No markdown fences, no explanation.';
    }
    systemField = useCache
      ? [{ type: 'text', text: sysText, cache_control: { type: 'ephemeral' } }]
      : sysText;
  }

  // ── Build messages (OpenAI-compatible for LiteLLM) ───────────────────────
  const messages: Array<{ role: string; content: string }> = [];

  // For the string form, use the system role message.
  // For the array+cache form, we pass system separately via body.system.
  if (systemField && typeof systemField === 'string') {
    messages.push({ role: 'system', content: systemField });
  }
  messages.push({ role: 'user', content: options.prompt });

  const body: Record<string, unknown> = {
    model: options.model,
    messages,
  };

  // Pass array-form system (with cache_control) as top-level field.
  // LiteLLM forwards this to Anthropic's Messages API verbatim.
  if (systemField && typeof systemField !== 'string') {
    body.system = systemField;
  }

  if (options.temperature !== undefined) body.temperature = options.temperature;
  if (options.maxTokens) body.max_tokens = options.maxTokens;
  if (options.jsonMode) {
    body.response_format = { type: 'json_object' };
  }

  try {
    // Attach Firebase ID token so the Cloud Function can verify the caller
    let authHeader = '';
    try {
      if (auth.currentUser) {
        const idToken = await getIdToken(auth.currentUser);
        authHeader = `Bearer ${idToken}`;
      }
    } catch {
      // If token fetch fails (logged-out race condition), proceed without auth;
      // the Cloud Function will return 401 and we surface that error normally.
    }

    const response = await fetch(PROXY_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(authHeader ? { Authorization: authHeader } : {}),
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Proxy error (${response.status}): ${errorText}`);
    }

    _proxyAvailable = true;

    const data = await response.json();

    // Log cache activity in dev
    if (import.meta.env.DEV && data.usage) {
      const read = data.usage.cache_read_tokens ?? 0;
      const write = data.usage.cache_creation_tokens ?? 0;
      if (read > 0 || write > 0) {
        console.info(`[proxyClient] Cache — read: ${read} tok, write: ${write} tok`);
      }
    }

    return {
      text: data.text ?? '',
      usage: data.usage
        ? {
            input_tokens: data.usage.input_tokens ?? data.usage.prompt_tokens ?? 0,
            output_tokens: data.usage.output_tokens ?? data.usage.completion_tokens ?? 0,
            cache_read_tokens: data.usage.cache_read_tokens ?? 0,
            cache_creation_tokens: data.usage.cache_creation_tokens ?? 0,
          }
        : undefined,
    };
  } catch (err) {
    // TypeError = network-level failure (connection refused, DNS error, etc.)
    if (err instanceof TypeError) {
      _proxyAvailable = false;
      _proxyFailedAt = Date.now();
      return callDirectFallback(options);
    }
    throw err;
  }
}
