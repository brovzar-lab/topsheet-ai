/**
 * llmProxy — Generic LLM proxy Cloud Function for TOPSHEET AI.
 *
 * Forwards chat completion requests to the shared LiteLLM server.
 * API keys never touch the browser — they live in functions/.env.
 */

import { onRequest, HttpsError } from 'firebase-functions/v2/https';
import { defineString } from 'firebase-functions/params';
import cors = require('cors');

const LITELLM_BASE_URL = defineString('LITELLM_BASE_URL');
const LITELLM_API_KEY = defineString('LITELLM_API_KEY');

const corsHandler = cors({
  origin: [
    /topsheet-ai\.web\.app$/,
    /topsheet-ai\.firebaseapp\.com$/,
    /localhost:\d+$/,
    /127\.0\.0\.1:\d+$/,
  ],
  methods: ['POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type'],
  maxAge: 3600,
});

export const llmProxy = onRequest(
  {
    timeoutSeconds: 540,
    memory: '256MiB',
    maxInstances: 50,
    region: 'us-central1',
  },
  (req, res) => {
    corsHandler(req, res, async () => {
      if (req.method !== 'POST') {
        res.status(405).json({ error: 'Method not allowed' });
        return;
      }

      try {
        const {
          model,
          messages,
          response_format,
          temperature,
          max_tokens,
        } = req.body;

        if (!model || !messages) {
          throw new HttpsError('invalid-argument', 'model and messages are required');
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
