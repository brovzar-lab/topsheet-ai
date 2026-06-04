/**
 * llmProxy — Generic LLM proxy Cloud Function for TOPSHEET AI.
 *
 * Forwards chat completion requests to the shared LiteLLM server.
 * API keys never touch the browser — they live in functions/.env.
 *
 * Auth
 * ────
 * Every request must carry a valid Firebase ID token in the Authorization header:
 *   Authorization: Bearer <firebase-id-token>
 * The token is verified with the Firebase Admin SDK before any LLM call is made.
 * Unauthenticated requests are rejected with HTTP 401.
 *
 * Prompt Caching
 * ─────────────
 * When the client sends `body.system` as a content-block array
 * (e.g. [{ type: 'text', text: '...', cache_control: { type: 'ephemeral' } }]),
 * we pass it through to LiteLLM verbatim. LiteLLM forwards it to Anthropic
 * natively, enabling ~90% cheaper cached input tokens for stable system prompts.
 */

import { onRequest, HttpsError } from 'firebase-functions/v2/https';
import { defineString } from 'firebase-functions/params';
import * as admin from 'firebase-admin';
import cors = require('cors');

// Initialise Admin SDK (idempotent — safe to call multiple times)
if (!admin.apps.length) admin.initializeApp();

const LITELLM_BASE_URL = defineString('LITELLM_BASE_URL');
const LITELLM_API_KEY = defineString('LITELLM_API_KEY');

// Safety limits — prevent cost-amplification attacks
const MAX_TOKENS_LIMIT = 16_000;
const MAX_MESSAGES = 50;

const corsHandler = cors({
  origin: [
    /topsheet-ai\.web\.app$/,
    /topsheet-ai\.firebaseapp\.com$/,
    /localhost:\d+$/,
    /127\.0\.0\.1:\d+$/,
  ],
  methods: ['POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  maxAge: 3600,
});

export const llmProxy = onRequest(
  {
    timeoutSeconds: 540,
    memory: '256MiB',
    maxInstances: 50,
    region: 'us-central1',
    // invoker: 'public' is required so Firebase Hosting rewrites can reach the function.
    // Auth is enforced inside the handler via Firebase ID-token verification — NOT via IAM.
    invoker: 'public',
  },
  (req, res) => {
    corsHandler(req, res, async () => {
      // Handle CORS preflight
      if (req.method === 'OPTIONS') {
        res.status(204).send('');
        return;
      }

      if (req.method !== 'POST') {
        res.status(405).json({ error: 'Method not allowed' });
        return;
      }

      // ── Auth check ────────────────────────────────────────────────────────
      const authHeader = req.headers.authorization;
      if (!authHeader?.startsWith('Bearer ')) {
        res.status(401).json({ error: 'Missing or malformed Authorization header' });
        return;
      }
      try {
        await admin.auth().verifyIdToken(authHeader.slice('Bearer '.length));
      } catch {
        res.status(401).json({ error: 'Invalid or expired Firebase ID token' });
        return;
      }
      // ─────────────────────────────────────────────────────────────────────

      try {
        const {
          model,
          messages,
          system,        // optional top-level system field (may include cache_control blocks)
          response_format,
          temperature,
          max_tokens,
        } = req.body;

        if (!model || !messages) {
          throw new HttpsError('invalid-argument', 'model and messages are required');
        }

        // Payload safety limits — reject requests that could rack up excessive cost
        if (!Array.isArray(messages) || messages.length > MAX_MESSAGES) {
          throw new HttpsError(
            'invalid-argument',
            `messages must be an array with at most ${MAX_MESSAGES} entries`,
          );
        }
        if (max_tokens !== undefined && max_tokens > MAX_TOKENS_LIMIT) {
          throw new HttpsError(
            'invalid-argument',
            `max_tokens must not exceed ${MAX_TOKENS_LIMIT}`,
          );
        }

        const baseUrl = LITELLM_BASE_URL.value();
        const apiKey = LITELLM_API_KEY.value();

        if (!baseUrl || !apiKey || apiKey === 'your-litellm-api-key-here') {
          throw new HttpsError(
            'failed-precondition',
            'LiteLLM proxy is not configured. Set LITELLM_BASE_URL and LITELLM_API_KEY in functions/.env',
          );
        }

        const body: Record<string, unknown> = { model, messages };
        // Forward system field verbatim — LiteLLM passes cache_control to Anthropic
        if (system !== undefined) body.system = system;
        if (response_format) body.response_format = response_format;
        if (temperature !== undefined) body.temperature = temperature;
        if (max_tokens) body.max_tokens = max_tokens;

        const llmResponse = await fetch(`${baseUrl}/chat/completions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify(body),
        });

        if (!llmResponse.ok) {
          const errorText = await llmResponse.text();
          console.error(`[llmProxy] LiteLLM error ${llmResponse.status}:`, errorText);
          throw new HttpsError(
            'internal',
            `LLM API error (${llmResponse.status}): ${errorText.slice(0, 500)}`,
          );
        }

        const data = await llmResponse.json();
        const choice = data.choices?.[0];
        const text = choice?.message?.content ?? '';
        const usage = data.usage
          ? {
              input_tokens: data.usage.prompt_tokens ?? 0,
              output_tokens: data.usage.completion_tokens ?? 0,
              // Anthropic prompt cache fields (zero for Gemini — harmless)
              cache_read_tokens: data.usage.cache_read_input_tokens ?? 0,
              cache_creation_tokens: data.usage.cache_creation_input_tokens ?? 0,
            }
          : undefined;

        res.status(200).json({ text, model: data.model, usage });
      } catch (err) {
        if (err instanceof HttpsError) {
          res.status(400).json({ error: err.message });
          return;
        }
        console.error('[llmProxy] Unexpected error:', err);
        res.status(500).json({
          error: err instanceof Error ? err.message : 'Internal server error',
        });
      }
    });
  },
);
