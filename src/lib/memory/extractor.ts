/**
 * extractor.ts — LLM-based memory extraction + scope classification.
 *
 * Takes raw content (chat messages, user edits, etc.) and extracts
 * structured Memory objects. Uses Haiku/Flash (cheapest model) since
 * this is simple extraction, not creative reasoning.
 *
 * The extraction prompt instructs the LLM to classify each memory as
 * 'global' (universal production knowledge) or 'project' (script-specific).
 */

import type { ExtractedMemory, MemoryScope, RetainEvent } from '@/types/memory';
import { callLLM } from '@/lib/ai/proxyClient';
import { useSettingsStore } from '@/stores/settings-store';

// ── Extraction Prompt ───────────────────────────────────────────────────

const EXTRACTION_SYSTEM_PROMPT = `You are a memory extraction system for a film production assistant.

Your job: Extract structured lessons/facts from the provided content.

For EACH memory, classify its SCOPE:

**PROJECT** — if it references:
  - Specific character names from this screenplay (e.g., "Carnicero", "Irina")
  - Specific scene numbers (e.g., "Scene 27", "Scene 79")
  - Story plot points or narrative details
  - Locations unique to this screenplay's fictional world

**GLOBAL** — if it references:
  - General breakdown rules (e.g., "physical confrontations should be flagged for stunts")
  - Cost/rate information for crew or equipment (e.g., "$2,000/week for stunt coordinator")
  - Scheduling patterns or production best practices
  - Common mistakes across productions (e.g., "horror scripts often miss SFX elements")
  - Territory-specific knowledge NOT tied to a specific story

For EACH memory, classify its TYPE:
  - "fact" — Objective, verifiable statement
  - "experience" — Numeric data, rates, costs
  - "preference" — User's stated preference for how things should be done
  - "observation" — Pattern or insight synthesized from multiple facts

Return a JSON array of objects. Each object has:
{
  "scope": "global" | "project",
  "type": "fact" | "experience" | "preference" | "observation",
  "content": "One clear, concise sentence describing the lesson",
  "entities": ["named things mentioned: characters, locations, crew roles, vendors"],
  "categories": ["relevant element categories: cast, extras, stunts, sfx, vfx, props, set_dressing, vehicles, wardrobe, makeup_hair, animals, sound_music, special_equipment, locations, greenery, art_dept, security"],
  "keywords": ["lowercase search terms for matching against scene text"],
  "genre": "horror" | "thriller" | "drama" | "comedy" | "action" | null,
  "territory": "territory name if mentioned" | null,
  "sceneNumbers": ["scene numbers if referenced"] | null
}

Rules:
- Extract ONLY actionable production knowledge. Skip small talk, greetings, meta-discussion.
- Be specific: "physical confrontations → flag STUNTS" is better than "be careful with action scenes".
- One memory per fact. Don't combine multiple lessons into one.
- If the content has nothing worth remembering, return an empty array [].
- Keep content under 150 characters.
- Return ONLY the JSON array, no markdown fencing.`;

// ── Extraction ──────────────────────────────────────────────────────────

/**
 * Extract structured memories from a retain event.
 * Uses the cheapest available model (Haiku/Flash).
 */
export async function extractMemories(event: RetainEvent): Promise<ExtractedMemory[]> {
    // Skip very short content (not worth an LLM call)
    if (event.content.trim().length < 30) return [];

    const userPrompt = buildUserPrompt(event);

    const result = await callLLM({
        model: getCheapestModel(),
        systemPrompt: EXTRACTION_SYSTEM_PROMPT,
        prompt: userPrompt,
        jsonMode: true,
        temperature: 0.1,
        maxTokens: 2048,
    });

    return parseExtractionResponse(result.text);
}

function buildUserPrompt(event: RetainEvent): string {
    const parts: string[] = [
        `Source: ${event.source}`,
        `Project ID: ${event.projectId}`,
    ];

    if (event.sceneNumber) parts.push(`Scene: ${event.sceneNumber}`);
    if (event.genre) parts.push(`Genre: ${event.genre}`);
    if (event.territory) parts.push(`Territory: ${event.territory}`);
    if (event.categories?.length) parts.push(`Active categories: ${event.categories.join(', ')}`);

    parts.push('', '--- CONTENT TO EXTRACT FROM ---', '', event.content);

    return parts.join('\n');
}

function parseExtractionResponse(text: string): ExtractedMemory[] {
    try {
        // Strip markdown fencing if present
        let cleaned = text.trim();
        if (cleaned.startsWith('```')) {
            cleaned = cleaned.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
        }

        const parsed = JSON.parse(cleaned);

        if (!Array.isArray(parsed)) return [];

        // Validate each extracted memory
        return parsed
            .filter((item: unknown): item is Record<string, unknown> =>
                typeof item === 'object' && item !== null &&
                typeof (item as Record<string, unknown>).content === 'string' &&
                typeof (item as Record<string, unknown>).scope === 'string',
            )
            .map((item: Record<string, unknown>): ExtractedMemory => ({
                scope: (item.scope === 'global' ? 'global' : 'project') as MemoryScope,
                type: validateType(item.type as string),
                content: String(item.content).slice(0, 200),
                entities: toStringArray(item.entities),
                categories: toStringArray(item.categories),
                keywords: toStringArray(item.keywords),
                genre: typeof item.genre === 'string' ? item.genre : undefined,
                territory: typeof item.territory === 'string' ? item.territory : undefined,
                sceneNumbers: toStringArray(item.sceneNumbers),
            }))
            .filter((m) => m.content.length > 5); // skip empty/trivial
    } catch {
        console.warn('[Brain] Failed to parse extraction response');
        return [];
    }
}

function validateType(t: string): ExtractedMemory['type'] {
    if (['fact', 'experience', 'preference', 'observation'].includes(t)) {
        return t as ExtractedMemory['type'];
    }
    return 'fact'; // default
}

function toStringArray(val: unknown): string[] {
    if (!Array.isArray(val)) return [];
    return val.filter((v): v is string => typeof v === 'string');
}

/**
 * Get the cheapest model available for extraction.
 * Uses the MPI Learner role (typically cheapest configured model),
 * falls back to Gemini 2.5 Flash, then the default model.
 */
function getCheapestModel(): string {
    const settings = useSettingsStore.getState();
    // MPI Learner role is typically assigned the cheapest model
    return settings.getModelForRole('mpiLearner');
}
