/**
 * batch-processor.ts — Process screenplay scenes through Gemini in sequence.
 *
 * Sends scenes one at a time with a configurable delay between calls
 * to respect rate limits. Reports progress via callback.
 */

import type { GenerativeModel } from '@google/generative-ai';
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

export interface BatchResult {
    succeeded: SceneBreakdown[];
    failed: { sceneNumber: string; error: string }[];
}

// -----------------------------------------------------------------------
// Configuration
// -----------------------------------------------------------------------

/** Delay between API calls in ms (Gemini free-tier: 15 RPM → 4s safe) */
const INTER_CALL_DELAY_MS = 4000;

// -----------------------------------------------------------------------
// Batch processor
// -----------------------------------------------------------------------

/**
 * Process an array of scenes through Gemini for breakdown extraction.
 *
 * Scenes are processed sequentially with a delay between calls.
 * Failures are logged and skipped — processing continues.
 *
 * @param model - Gemini model instance (from createBreakdownModel)
 * @param scenes - Parsed scene array
 * @param onProgress - Callback fired after each scene
 * @param signal - Optional AbortSignal to cancel the batch
 */
export async function processBreakdownBatch(
    model: GenerativeModel,
    scenes: Scene[],
    onProgress?: ProgressCallback,
    signal?: AbortSignal,
): Promise<BatchResult> {
    const succeeded: SceneBreakdown[] = [];
    const failed: { sceneNumber: string; error: string }[] = [];
    const total = scenes.length;

    for (let i = 0; i < scenes.length; i++) {
        // Check for cancellation
        if (signal?.aborted) {
            console.log('[batch-processor] Aborted by user');
            break;
        }

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
                model,
                scene.sceneNumber,
                scene.content,
                scene.slugline.raw,
            );

            succeeded.push({
                sceneNumber: scene.sceneNumber,
                elements,
                reviewed: false,
            });

            console.log(
                `[batch-processor] ✓ ${sceneLabel}: ${elements.length} elements`,
            );
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : String(err);
            console.error(`[batch-processor] ✗ ${sceneLabel}: ${message}`);
            failed.push({ sceneNumber: scene.sceneNumber, error: message });

            // Fail-fast on fatal errors (wrong model, bad API key, etc.)
            const status = (err as { status?: number })?.status;
            if (status === 404 || status === 401 || status === 403) {
                console.error(`[batch-processor] Fatal error (${status}), stopping batch`);
                // Mark remaining scenes as failed with the same error
                for (let j = i + 1; j < scenes.length; j++) {
                    failed.push({ sceneNumber: scenes[j]!.sceneNumber, error: message });
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

    console.log(
        `[batch-processor] Complete: ${succeeded.length} succeeded, ${failed.length} failed`,
    );

    return { succeeded, failed };
}

// -----------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------

function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
