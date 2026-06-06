---
name: gemini-prompt-guard
description: >
  Guards against common Gemini API failure modes in Topsheet AI. Use whenever
  modifying AI prompt templates, adding new Gemini API calls, or debugging AI
  response parsing failures. Triggers on: prompt template changes, Gemini client
  modifications, JSON parse errors from AI responses, PROHIBITED_CONTENT errors,
  slow AI responses, or any work in src/lib/ai/.
---

# Gemini Prompt Guard

## Response Parsing Rules

1. **Always set `responseMimeType: 'application/json'`** in Gemini config — this tells the model to return structured JSON, reducing free-form text responses.

2. **Strip markdown code fences before `JSON.parse`** — Gemini sometimes wraps JSON in `` ```json...``` `` even when `responseMimeType` is set. Always strip these before parsing:
   ```typescript
   const cleaned = raw.replace(/^```json\s*\n?/i, '').replace(/\n?```\s*$/i, '');
   const parsed = JSON.parse(cleaned);
   ```

3. **Handle BOTH response shapes** — Gemini may return a bare array `[...]` OR a wrapped object `{ elements: [...] }` / `{ scenes: [...] }`. Always normalize to array:
   ```typescript
   const result = Array.isArray(parsed) ? parsed : (parsed.elements ?? parsed.scenes ?? []);
   ```

4. **Use `thinkingBudget: 0`** in `thinkingConfig` for fast extraction tasks — prevents 30–90s thinking delays that add no value for structured extraction. Only enable thinking for complex reasoning tasks.

5. **Set safety settings to `BLOCK_NONE` on all categories** — screenplay content contains violence, mature themes, substance references, etc. that trigger false positives. All four harm categories must be set to `BLOCK_NONE`.

## Error Handling

1. **Handle `PROHIBITED_CONTENT` finish reason gracefully** — some screenplay content triggers this even with `BLOCK_NONE`. Surface to user with a clear message (e.g., "This section contains content the AI flagged — try editing the scene and retrying"), don't crash.

2. **Retry once on HTTP 429 (rate limit), 500, 503** — then surface error to user. Use exponential backoff on the single retry (e.g., 2s delay).

3. **Never silently swallow AI errors** — always `console.error` with full context (which prompt, which scene, what the raw response was) and surface a user-facing message.

## Prompt Template Standards

1. **Prompts live in `src/lib/ai/prompts/`** — never inline prompt strings in business logic.

2. **Prompt output schema must match TypeScript types in `src/types/`** — if the prompt asks for `{ element: string, category: string }`, there must be a matching type definition.

3. **Test prompts with real screenplay content, not synthetic test data** — synthetic data doesn't trigger the edge cases (accented characters, bilingual dialogue, stage directions with violence) that real Mexican screenplays contain.

4. **When changing prompts, run a full breakdown on a test screenplay and verify element counts** — prompt changes can silently reduce extraction quality without obvious errors.

## Validation Checklist (before merging any AI change)

- [ ] JSON response parses successfully with both fenced and unfenced formats
- [ ] Response shape normalization handles array and object wrappers
- [ ] `thinkingBudget: 0` is set for extraction tasks
- [ ] Safety settings are `BLOCK_NONE`
- [ ] `PROHIBITED_CONTENT` is handled without crashing
- [ ] Retry logic exists for 429/500/503
- [ ] TypeScript types match the expected response schema

## Key Files

- `src/lib/ai/gemini-client.ts` — Gemini client configuration
- `src/lib/ai/proxyClient.ts` — LLM proxy client (multi-model support)
- `src/lib/ai/batch-processor.ts` — Batch scene processing
- `src/lib/ai/prompts/` — Prompt templates
- `functions/src/llmProxy.ts` — Cloud Function proxy
