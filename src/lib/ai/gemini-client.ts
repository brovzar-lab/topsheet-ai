/**
 * gemini-client.ts — Thin wrapper around @google/generative-ai
 *
 * Provides:
 *  - createBreakdownModel(): initialises Gemini with the right settings
 *  - generateSceneBreakdown(): calls the model and parses JSON into BreakdownElement[]
 *  - analyzeScript(): fast initial extraction — title, genre, logline, synopsis
 */

import { GoogleGenerativeAI, HarmBlockThreshold, HarmCategory } from '@google/generative-ai';
import type { GenerativeModel } from '@google/generative-ai';
import type { BreakdownElement } from '@/types';
import { buildBreakdownPrompt, validateElement } from './prompts/breakdown';

// -----------------------------------------------------------------------
// Cached Gemini client — reuse across calls to avoid creating new HTTP pools
// -----------------------------------------------------------------------

let _cachedClient: { key: string; instance: GoogleGenerativeAI } | null = null;

function getClient(apiKey: string): GoogleGenerativeAI {
    if (_cachedClient?.key === apiKey) return _cachedClient.instance;
    const instance = new GoogleGenerativeAI(apiKey);
    _cachedClient = { key: apiKey, instance };
    return instance;
}

// -----------------------------------------------------------------------
// Script Analysis (initial upload card)
// -----------------------------------------------------------------------

export interface ScriptAnalysis {
    /** Detected or inferred screenplay title */
    title: string;
    /** Genre(s), e.g. "Drama, Thriller" */
    genre: string;
    /** One-sentence logline */
    logline: string;
    /** 2-3 sentence synopsis */
    synopsis: string;
    /** Top 4 locations from the sluglines */
    topLocations: string[];
    /** Mood/tone tags, e.g. ["dark", "suspenseful"] */
    tone: string[];
}

/**
 * Fast AI analysis of a screenplay — runs on the first ~12 000 chars
 * (roughly 10 pages) to extract metadata without burning tokens.
 */
export async function analyzeScript(
    apiKey: string,
    scriptText: string,
    sceneCount: number,
    pageCount: number,
    filenameTitle: string,
): Promise<ScriptAnalysis> {
    const genAI = getClient(apiKey);
    const model = genAI.getGenerativeModel({
        model: 'gemini-2.5-flash',
        generationConfig: { responseMimeType: 'application/json', temperature: 0.3 },
        safetySettings: [
            { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_NONE },
            { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_NONE },
            { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_NONE },
            { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_NONE },
        ],
    });

    // Use first 12 000 chars — enough context to detect title, genre, and premise
    const sample = scriptText.slice(0, 12000);

    const prompt = `You are a professional script reader. Analyze this screenplay excerpt and return ONLY valid JSON.

Screenplay excerpt (first ~10 pages):
---
${sample}
---

Context: ${sceneCount} scenes, ${pageCount} pages. Filename hint: "${filenameTitle}"

Return exactly this JSON (no markdown fences, no extra keys):
{
  "title": "...",
  "genre": "...",
  "logline": "...",
  "synopsis": "...",
  "topLocations": ["...", "...", "...", "..."],
  "tone": ["...", "..."]
}

Rules:
- title: use title from the script cover page if visible, otherwise infer from context or use the filename hint
- genre: max 3 genres, comma-separated
- logline: exactly ONE sentence, < 25 words
- synopsis: exactly 2-3 sentences summarizing the premise
- topLocations: up to 4 most prominent location names from sluglines
- tone: 2-4 lowercase mood/atmosphere words (e.g. "tense", "comedic", "melancholic")`;

    const result = await model.generateContent(prompt);
    const text = result.response.text().trim()
        .replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '');

    try {
        const parsed = JSON.parse(text) as ScriptAnalysis;
        return {
            title: parsed.title || filenameTitle,
            genre: parsed.genre || 'Drama',
            logline: parsed.logline || '',
            synopsis: parsed.synopsis || '',
            topLocations: Array.isArray(parsed.topLocations) ? parsed.topLocations.slice(0, 4) : [],
            tone: Array.isArray(parsed.tone) ? parsed.tone.slice(0, 4) : [],
        };
    } catch {
        return {
            title: filenameTitle,
            genre: 'Drama',
            logline: '',
            synopsis: 'Could not generate synopsis.',
            topLocations: [],
            tone: [],
        };
    }
}

// -----------------------------------------------------------------------
// Model factory
// -----------------------------------------------------------------------

const MODEL_NAME = 'gemini-2.5-flash';

/**
 * Create a Gemini model tuned for structured breakdown extraction.
 */
export function createBreakdownModel(apiKey: string): GenerativeModel {
    const genAI = getClient(apiKey);

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

function nextId(): string {
    return `el_${crypto.randomUUID()}`;
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

            // Detect content-blocked responses before calling .text()
            const response = result.response;
            const blockReason = response.promptFeedback?.blockReason;
            const finishReason = response.candidates?.[0]?.finishReason;

            if (blockReason || finishReason === 'SAFETY') {
                throw new Error(
                    `Content filter blocked scene ${sceneNumber}: ` +
                    `${blockReason || finishReason} — ` +
                    `the screenplay text triggered Gemini's safety filter (PROHIBITED_CONTENT). ` +
                    `This is fictional screenplay content; try retrying or editing the scene text.`
                );
            }

            const text = response.text();
            return parseBreakdownResponse(text);
        } catch (err: unknown) {
            lastError = err;
            const message = err instanceof Error ? err.message : String(err);
            const status = (err as { status?: number })?.status;

            // Retry on rate-limit or server error
            if (attempt === 0 && (status === 429 || status === 500 || status === 503)) {
                await sleep(2000);
                continue;
            }

            // Content-filter errors — no retry will help
            if (message.includes('PROHIBITED_CONTENT') || message.includes('blocked')) {
                throw err;
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
