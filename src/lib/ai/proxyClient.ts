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
}

export interface LLMResponse {
  text: string;
  usage?: {
    input_tokens: number;
    output_tokens: number;
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

  const body: Record<string, unknown> = {
    model: stripAnthropicPrefix(options.model),
    max_tokens: options.maxTokens ?? 4096,
    messages: [{ role: 'user', content: options.prompt }],
  };

  // System prompt — Anthropic uses a top-level `system` field, not a system role
  if (options.systemPrompt) {
    let sys = options.systemPrompt;
    if (options.jsonMode) sys += '\n\nYou must respond with valid JSON only. No markdown fences, no explanation.';
    body.system = sys;
  } else if (options.jsonMode) {
    body.system = 'You must respond with valid JSON only. No markdown fences, no explanation.';
  }

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
 */
export async function callLLM(options: LLMRequest): Promise<LLMResponse> {
  // If we already know the proxy is down, skip straight to direct
  if (_proxyAvailable === false) {
    return callDirectFallback(options);
  }

  const messages: Array<{ role: string; content: string }> = [];

  if (options.systemPrompt) {
    messages.push({ role: 'system', content: options.systemPrompt });
  }
  messages.push({ role: 'user', content: options.prompt });

  const body: Record<string, unknown> = {
    model: options.model,
    messages,
  };

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

    return {
      text: data.text ?? '',
      usage: data.usage
        ? {
            input_tokens: data.usage.input_tokens ?? data.usage.prompt_tokens ?? 0,
            output_tokens: data.usage.output_tokens ?? data.usage.completion_tokens ?? 0,
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
