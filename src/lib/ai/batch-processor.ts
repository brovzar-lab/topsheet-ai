/**
 * batch-processor.ts — Process screenplay scenes through LLM proxy in sequence.
 *
 * Sends scenes one at a time with a configurable delay between calls
 * to respect rate limits. Reports progress via callback.
 */

import type { Scene, SceneBreakdown } from '@/types';
import { generateSceneBreakdown } from './gemini-client';

// -----------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------

export interface BatchProgress {
    completed: number;
    total: number;
    currentScene: string;
    phase: 'processing' | 'done' | 'error';
}

export type ProgressCallback = (progress: BatchProgress) => void;

export type ErrorType = 'quota' | 'auth' | 'parse' | 'content_filter' | 'unknown';

export interface FailedScene {
    sceneNumber: string;
    error: string;
    errorType: ErrorType;
    /** Raw scene text — used to seed the Line Producer panel */
    sceneContent: string;
    /** Slugline for display */
    slugline: string;
}

export interface BatchResult {
    succeeded: SceneBreakdown[];
    failed: FailedScene[];
}

// -----------------------------------------------------------------------
// Configuration
// -----------------------------------------------------------------------

/** Delay between API calls in ms (rate limiting: 15 RPM → 4s safe) */
const INTER_CALL_DELAY_MS = 4000;

// -----------------------------------------------------------------------
// Batch processor
// -----------------------------------------------------------------------

/**
 * Process an array of scenes through the LLM proxy for breakdown extraction.
 *
 * Scenes are processed sequentially with a delay between calls.
 * Failures are logged and skipped — processing continues.
 *
 * @param scenes - Parsed scene array
 * @param onProgress - Callback fired after each scene
 * @param signal - Optional AbortSignal to cancel the batch
 * @param skillContext - Optional context for skill-specific prompting
 */
export async function processBreakdownBatch(
    scenes: Scene[],
    onProgress?: ProgressCallback,
    signal?: AbortSignal,
    skillContext?: string,
): Promise<BatchResult> {
    const succeeded: SceneBreakdown[] = [];
    const failed: FailedScene[] = [];
    const total = scenes.length;

    for (let i = 0; i < scenes.length; i++) {
        if (signal?.aborted) break;

        const scene = scenes[i]!;
        const sceneLabel = `Scene ${scene.sceneNumber}`;

        onProgress?.({
            completed: i,
            total,
            currentScene: sceneLabel,
            phase: 'processing',
        });

        try {
            const elements = await generateSceneBreakdown(
                scene.sceneNumber,
                scene.content,
                scene.slugline.raw,
                skillContext,
            );

            succeeded.push({
                sceneNumber: scene.sceneNumber,
                elements,
                reviewed: false,
            });
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : String(err);
            const lowerMsg = message.toLowerCase();
            const errorType: ErrorType =
                lowerMsg.includes('prohibited_content') || lowerMsg.includes('content filter blocked') ? 'content_filter'
                : lowerMsg.includes('429') ? 'quota'
                : (lowerMsg.includes('401') || lowerMsg.includes('403')) ? 'auth'
                : lowerMsg.includes('parse') || lowerMsg.includes('json') ? 'parse'
                : 'unknown';

            console.error(`[batch-processor] ✗ ${sceneLabel} [${errorType}]: ${message}`);
            failed.push({
                sceneNumber: scene.sceneNumber,
                error: message,
                errorType,
                sceneContent: scene.content,
                slugline: scene.slugline.raw,
            });

            // Fail-fast on fatal errors (wrong model, bad API key, etc.)
            if (lowerMsg.includes('401') || lowerMsg.includes('403') || lowerMsg.includes('404')) {
                console.error(`[batch-processor] Fatal error, stopping batch`);
                for (let j = i + 1; j < scenes.length; j++) {
                    failed.push({
                        sceneNumber: scenes[j]!.sceneNumber,
                        error: message,
                        errorType: 'auth',
                        sceneContent: scenes[j]!.content,
                        slugline: scenes[j]!.slugline.raw,
                    });
                }
                break;
            }
        }

        // Inter-call delay (skip after last scene)
        if (i < scenes.length - 1 && !signal?.aborted) {
            await sleep(INTER_CALL_DELAY_MS);
        }
    }

    onProgress?.({
        completed: total,
        total,
        currentScene: '',
        phase: 'done',
    });

    return { succeeded, failed };
}

// -----------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------

function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
