/**
 * gemini-client.ts — Thin wrapper around @google/generative-ai
 *
 * Provides:
 *  - createBreakdownModel(): initialises Gemini with the right settings
 *  - generateSceneBreakdown(): calls the model and parses JSON into BreakdownElement[]
 */

import { GoogleGenerativeAI, HarmBlockThreshold, HarmCategory } from '@google/generative-ai';
import type { GenerativeModel } from '@google/generative-ai';
import type { BreakdownElement } from '@/types';
import { buildBreakdownPrompt, validateElement } from './prompts/breakdown';

// -----------------------------------------------------------------------
// Model factory
// -----------------------------------------------------------------------

const MODEL_NAME = 'gemini-2.5-flash';

/**
 * Create a Gemini model tuned for structured breakdown extraction.
 */
export function createBreakdownModel(apiKey: string): GenerativeModel {
    const genAI = new GoogleGenerativeAI(apiKey);

    return genAI.getGenerativeModel({
        model: MODEL_NAME,
        generationConfig: {
            responseMimeType: 'application/json',
            temperature: 0.2,      // low creativity — we want factual extraction
            maxOutputTokens: 4096,
        },
        safetySettings: [
            { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_NONE },
            { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_NONE },
            { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_NONE },
            { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_NONE },
        ],
    });
}

// -----------------------------------------------------------------------
// Breakdown generation
// -----------------------------------------------------------------------

let _idCounter = 0;
function nextId(): string {
    return `el_${Date.now()}_${++_idCounter}`;
}

/**
 * Run a Gemini breakdown call on a single scene.
 * Returns cleaned BreakdownElement[] with generated IDs.
 *
 * Retries once on 429 / 500 with exponential backoff.
 */
export async function generateSceneBreakdown(
    model: GenerativeModel,
    sceneNumber: string,
    sceneContent: string,
    sluglineRaw: string,
): Promise<BreakdownElement[]> {
    const { systemPrompt, userPrompt } = buildBreakdownPrompt(sceneNumber, sceneContent, sluglineRaw);

    let lastError: unknown;
    for (let attempt = 0; attempt < 2; attempt++) {
        try {
            const result = await model.generateContent({
                contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
                systemInstruction: { role: 'model', parts: [{ text: systemPrompt }] },
            });

            const text = result.response.text();
            return parseBreakdownResponse(text);
        } catch (err: unknown) {
            lastError = err;
            const status = (err as { status?: number })?.status;
            if (attempt === 0 && (status === 429 || status === 500)) {
                // Wait 2s before retry
                await sleep(2000);
                continue;
            }
            throw err;
        }
    }

    throw lastError;
}

// -----------------------------------------------------------------------
// Response parsing
// -----------------------------------------------------------------------

/**
 * Parse Gemini's JSON text into BreakdownElement[].
 * Handles common LLM quirks: markdown fences, extra whitespace, partial objects.
 */
function parseBreakdownResponse(text: string): BreakdownElement[] {
    // Strip markdown fences if present
    let cleaned = text.trim();
    if (cleaned.startsWith('```')) {
        cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '');
    }

    let parsed: unknown;
    try {
        parsed = JSON.parse(cleaned);
    } catch {
        console.error('[gemini-client] Failed to parse JSON:', cleaned.substring(0, 200));
        return [];
    }

    // Accept both a top-level array or an object with an "elements" key
    let rawArray: unknown[];
    if (Array.isArray(parsed)) {
        rawArray = parsed;
    } else if (parsed && typeof parsed === 'object' && 'elements' in parsed && Array.isArray((parsed as Record<string, unknown>).elements)) {
        rawArray = (parsed as Record<string, unknown>).elements as unknown[];
    } else {
        console.error('[gemini-client] Unexpected response structure:', typeof parsed);
        return [];
    }

    const elements: BreakdownElement[] = [];
    for (const raw of rawArray) {
        if (!raw || typeof raw !== 'object') continue;
        const validated = validateElement(raw as Record<string, unknown>);
        if (validated) {
            elements.push({
                id: nextId(),
                categoryId: validated.categoryId,
                name: validated.name,
                description: validated.description,
                quantity: validated.quantity,
                source: 'ai',
            });
        }
    }

    return elements;
}

// -----------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------

function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
