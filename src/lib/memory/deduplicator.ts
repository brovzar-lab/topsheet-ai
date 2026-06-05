/**
 * deduplicator.ts — Scope-aware memory deduplication.
 *
 * Uses Jaccard token overlap (same algorithm as mpi-learner.ts::similarity)
 * to detect near-duplicate memories. Only deduplicates within the same scope
 * (global vs. global, project vs. project) — never cross-scope.
 *
 * When a duplicate is found, the existing memory's confidence is boosted
 * (reinforcement) instead of creating a new record.
 */

import type { Memory, ExtractedMemory, MemoryScope } from '@/types/memory';

// ── Configuration ───────────────────────────────────────────────────────

/** Jaccard similarity threshold — above this, two memories are duplicates. */
const DEDUP_THRESHOLD = 0.65;

// ── Token Utilities ─────────────────────────────────────────────────────

/** Normalise and tokenise a string into a set of lowercase words. */
function tokenise(text: string): Set<string> {
    return new Set(
        text
            .toLowerCase()
            .replace(/[^a-záéíóúüñ0-9\s]/g, ' ')
            .split(/\s+/)
            .filter((w) => w.length > 1),
    );
}

/** Jaccard similarity between two token sets. */
function jaccard(a: Set<string>, b: Set<string>): number {
    if (a.size === 0 && b.size === 0) return 1;
    let intersection = 0;
    for (const token of a) {
        if (b.has(token)) intersection++;
    }
    const union = a.size + b.size - intersection;
    return union === 0 ? 0 : intersection / union;
}

// ── Deduplication ───────────────────────────────────────────────────────

export interface DedupResult {
    /** New memories that don't match any existing memory. */
    novel: ExtractedMemory[];
    /** Existing memories whose confidence should be reinforced. */
    reinforced: Memory[];
}

/**
 * Check extracted memories against existing ones within the same scope.
 * Returns which are truly new and which should reinforce existing memories.
 */
export function deduplicateMemories(
    extracted: ExtractedMemory[],
    existing: Memory[],
    scope: MemoryScope,
): DedupResult {
    const novel: ExtractedMemory[] = [];
    const reinforced: Memory[] = [];
    const alreadyReinforced = new Set<string>();

    // Filter existing to same scope
    const scopedExisting = existing.filter((m) => m.scope === scope && !m.archived);

    // Pre-tokenise existing memories
    const existingTokens = scopedExisting.map((m) => ({
        memory: m,
        tokens: tokenise(m.content),
    }));

    for (const candidate of extracted) {
        if (candidate.scope !== scope) {
            // Wrong scope — skip (should not happen, but safety)
            novel.push(candidate);
            continue;
        }

        const candidateTokens = tokenise(candidate.content);
        let bestMatch: Memory | null = null;
        let bestScore = 0;

        for (const { memory, tokens } of existingTokens) {
            const score = jaccard(candidateTokens, tokens);
            if (score > bestScore) {
                bestScore = score;
                bestMatch = memory;
            }
        }

        if (bestMatch && bestScore >= DEDUP_THRESHOLD && !alreadyReinforced.has(bestMatch.id)) {
            // Duplicate — reinforce existing
            reinforced.push(bestMatch);
            alreadyReinforced.add(bestMatch.id);
        } else {
            // Novel — create new memory
            novel.push(candidate);
        }
    }

    return { novel, reinforced };
}

/**
 * Calculate reinforced confidence: slight boost when a memory is confirmed
 * by a new extraction. Capped at 0.98.
 */
export function reinforceConfidence(current: number, timesConfirmed: number): number {
    const boost = 0.05 * (1 / (1 + timesConfirmed * 0.3)); // diminishing returns
    return Math.min(0.98, current + boost);
}
