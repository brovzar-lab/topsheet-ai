/**
 * API Key Validators — Topsheet AI
 *
 * Makes minimal real API calls to verify that keys actually work.
 * Gemini: calls listModels (free, no generation)
 * Anthropic: sends a 1-token message (cheapest possible call)
 */

export interface ValidationResult {
  valid: boolean;
  error?: string;
}

/**
 * Validate a Gemini API key by calling the listModels endpoint.
 * This is free — no generation cost.
 */
export async function validateGeminiKey(apiKey: string): Promise<ValidationResult> {
  if (!apiKey.trim()) return { valid: false, error: 'Key is empty' };

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(apiKey)}`,
      { method: 'GET', signal: AbortSignal.timeout(10_000) },
    );

    if (res.ok) return { valid: true };

    if (res.status === 400 || res.status === 403) {
      return { valid: false, error: 'Invalid API key' };
    }

    const body = await res.text().catch(() => '');
    return { valid: false, error: `API error (${res.status}): ${body.slice(0, 100)}` };
  } catch (err) {
    if (err instanceof DOMException && err.name === 'TimeoutError') {
      return { valid: false, error: 'Request timed out — check your network' };
    }
    return { valid: false, error: 'Network error — check your connection' };
  }
}

/**
 * Validate an Anthropic API key by sending a minimal 1-token completion.
 * Cost: ~$0.000003 (effectively free).
 */
export async function validateAnthropicKey(apiKey: string): Promise<ValidationResult> {
  if (!apiKey.trim()) return { valid: false, error: 'Key is empty' };

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5',
        max_tokens: 1,
        messages: [{ role: 'user', content: 'Hi' }],
      }),
      signal: AbortSignal.timeout(10_000),
    });

    if (res.ok) return { valid: true };

    if (res.status === 401) {
      return { valid: false, error: 'Invalid API key' };
    }
    if (res.status === 403) {
      return { valid: false, error: 'API key lacks permission' };
    }

    const body = await res.text().catch(() => '');
    return { valid: false, error: `API error (${res.status}): ${body.slice(0, 100)}` };
  } catch (err) {
    if (err instanceof DOMException && err.name === 'TimeoutError') {
      return { valid: false, error: 'Request timed out — check your network' };
    }
    return { valid: false, error: 'Network error — check your connection' };
  }
}
