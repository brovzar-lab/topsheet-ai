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

const PROXY_URL = import.meta.env.DEV
  ? 'http://127.0.0.1:5001/topsheet-ai/us-central1/llmProxy'
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
// Proxy availability cache — skip fetch after first connection failure
// -----------------------------------------------------------------------

let _proxyAvailable: boolean | null = null;

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
  const apiKey = import.meta.env.VITE_GEMINI_API_KEY as string | undefined;
  if (!apiKey) {
    throw new Error(
      'LLM proxy is unavailable and no VITE_GEMINI_API_KEY is set. ' +
      'Either start the Firebase emulator or add VITE_GEMINI_API_KEY to .env.local',
    );
  }

  const genAI = getGeminiClient(apiKey);

  const generationConfig: Record<string, unknown> = {
    temperature: options.temperature ?? 0.7,
  };
  if (options.jsonMode) generationConfig.responseMimeType = 'application/json';
  if (options.maxTokens) generationConfig.maxOutputTokens = options.maxTokens;

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
  const apiKey = import.meta.env.VITE_ANTHROPIC_API_KEY as string | undefined;
  if (!apiKey) {
    throw new Error(
      'LLM proxy is unavailable and no VITE_ANTHROPIC_API_KEY is set. ' +
      'Either start the Firebase emulator or add VITE_ANTHROPIC_API_KEY to .env.local',
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
  // If we already know the proxy is down, skip straight to direct
  if (_proxyAvailable === false) {
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
    const response = await fetch(PROXY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
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
      return callDirectFallback(options);
    }
    throw err;
  }
}
