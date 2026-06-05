/**
 * brain-service.ts — Core Project Brain service.
 *
 * Implements the three Hindsight-inspired operations:
 *   retain()  — Extract + classify + store memories from events
 *   recall()  — Multi-channel retrieval with scoring
 *   reflect() — Consolidation, decay, and observation synthesis
 *
 * Two scopes are strictly enforced:
 *   - Global memories live at users/{uid}/global_memories/
 *   - Project memories live at users/{uid}/projects/{pid}/memories/
 */

import type {
    Memory, MemoryScope, QueryContext, ScoredMemory, RetainEvent,
    ExtractedMemory,
} from '@/types/memory';
import {
    DEFAULT_CONFIDENCE, ARCHIVE_THRESHOLD, MAX_RECALL_MEMORIES,
    DECAY_RATE_PER_DAY,
} from '@/types/memory';
import { deduplicateMemories, reinforceConfidence } from './deduplicator';
import { extractMemories } from './extractor';
import { saveMemory, saveMemories, updateMemory, archiveMemory } from '@/lib/firestore/memories';
import { getCurrentUid } from '@/lib/auth-state';

// ── Helpers ─────────────────────────────────────────────────────────────

function generateId(): string {
    return `mem_${crypto.randomUUID()}`;
}

function now(): string {
    return new Date().toISOString();
}

function daysBetween(a: string | undefined, b: string): number {
    if (!a) return 365; // treat never-used memories as very old
    const msPerDay = 86_400_000;
    return Math.abs(new Date(b).getTime() - new Date(a).getTime()) / msPerDay;
}

/** Tokenise text into lowercase word set for matching. */
function tokenise(text: string): Set<string> {
    return new Set(
        text
            .toLowerCase()
            .replace(/[^a-záéíóúüñ0-9\s]/g, ' ')
            .split(/\s+/)
            .filter((w) => w.length > 1),
    );
}

/** Count intersection of two string arrays. */
function intersectCount(a: string[], b: string[]): number {
    const setB = new Set(b.map((s) => s.toLowerCase()));
    return a.filter((s) => setB.has(s.toLowerCase())).length;
}

// ── RECALL ──────────────────────────────────────────────────────────────

/**
 * Score a memory against a query context.
 * Higher score = more relevant.
 */
function scoreMemory(memory: Memory, ctx: QueryContext): number {
    let score = 0;

    // 1. Keyword overlap (sparse search)
    if (ctx.keywords && ctx.keywords.length > 0) {
        const overlap = intersectCount(memory.keywords, ctx.keywords);
        score += Math.min(overlap * 0.15, 0.45); // cap contribution
    }

    // 2. Category match
    if (ctx.categories && ctx.categories.length > 0) {
        const overlap = intersectCount(memory.categories, ctx.categories);
        score += Math.min(overlap * 0.12, 0.36);
    }

    // 3. Entity match (graph traversal lite)
    if (ctx.entities && ctx.entities.length > 0) {
        const overlap = intersectCount(memory.entities, ctx.entities);
        score += Math.min(overlap * 0.15, 0.45);
    }

    // 4. Scene content keyword match (if full text provided)
    if (ctx.sceneContent) {
        const sceneTokens = tokenise(ctx.sceneContent);
        let contentOverlap = 0;
        for (const kw of memory.keywords) {
            if (sceneTokens.has(kw.toLowerCase())) contentOverlap++;
        }
        for (const ent of memory.entities) {
            // Entity names may be multi-word — check each word
            const entWords = ent.toLowerCase().split(/\s+/);
            for (const w of entWords) {
                if (sceneTokens.has(w)) { contentOverlap++; break; }
            }
        }
        score += Math.min(contentOverlap * 0.08, 0.3);
    }

    // 5. Confidence weight
    score += memory.confidence * 0.15;

    // 6. Temporal recency bonus (recently used memories are more relevant)
    const daysOld = daysBetween(memory.lastRecalledAt, now());
    score += Math.max(0, 0.05 * (1 - daysOld / 90));

    // 7. Genre match bonus
    if (ctx.genre && memory.genre && ctx.genre.toLowerCase() === memory.genre.toLowerCase()) {
        score += 0.08;
    }

    // 8. Territory match bonus
    if (ctx.territory && memory.territory && ctx.territory.toLowerCase() === memory.territory.toLowerCase()) {
        score += 0.06;
    }

    return score;
}

/**
 * Retrieve the most relevant memories for a given context.
 * Merges global + project memories, scores them, returns top N.
 */
export function recall(
    globalMemories: Memory[],
    projectMemories: Memory[],
    context: QueryContext,
    maxResults: number = MAX_RECALL_MEMORIES,
): ScoredMemory[] {
    const all = [...globalMemories, ...projectMemories]
        .filter((m) => !m.archived && m.confidence > ARCHIVE_THRESHOLD);

    const scored: ScoredMemory[] = all
        .map((memory) => ({ memory, score: scoreMemory(memory, context) }))
        .filter((s) => s.score > 0.05) // minimum relevance threshold
        .sort((a, b) => b.score - a.score)
        .slice(0, maxResults);

    return scored;
}

/**
 * Format recalled memories into a string for system prompt injection.
 * Separates global vs. project memories for clarity.
 */
export function formatForPrompt(scoredMemories: ScoredMemory[]): string {
    if (scoredMemories.length === 0) return '';

    const globalMems = scoredMemories.filter((s) => s.memory.scope === 'global');
    const projectMems = scoredMemories.filter((s) => s.memory.scope === 'project');

    const lines: string[] = [
        '',
        '---',
        '## 🧠 Project Brain — Learned Knowledge',
        '',
    ];

    if (globalMems.length > 0) {
        lines.push('### Production Knowledge (from past experience):');
        for (const { memory } of globalMems) {
            const typeEmoji = memory.type === 'experience' ? '💰'
                : memory.type === 'preference' ? '🎯'
                : memory.type === 'observation' ? '🔍'
                : '📌';
            lines.push(`${typeEmoji} ${memory.content}`);
        }
        lines.push('');
    }

    if (projectMems.length > 0) {
        lines.push('### This Screenplay:');
        for (const { memory } of projectMems) {
            lines.push(`• ${memory.content}`);
        }
        lines.push('');
    }

    lines.push('Apply this knowledge when analyzing scenes. Do not repeat these facts back to the user unless directly relevant to their question.');

    return lines.join('\n');
}

// ── RETAIN ──────────────────────────────────────────────────────────────

/**
 * Extract memories from an event, deduplicate, and persist.
 * Runs asynchronously — never blocks the UI.
 */
export async function retain(
    event: RetainEvent,
    existingGlobal: Memory[],
    existingProject: Memory[],
): Promise<Memory[]> {
    const uid = getCurrentUid();
    if (!uid) return [];

    // 1. Extract structured memories via LLM
    let extracted: ExtractedMemory[];
    try {
        extracted = await extractMemories(event);
    } catch (err) {
        console.warn('[Brain] Memory extraction failed:', err);
        return [];
    }

    if (extracted.length === 0) return [];

    // 2. Deduplicate against existing memories (scope-aware)
    const globalExtracted = extracted.filter((m) => m.scope === 'global');
    const projectExtracted = extracted.filter((m) => m.scope === 'project');

    const globalDedup = deduplicateMemories(globalExtracted, existingGlobal, 'global');
    const projectDedup = deduplicateMemories(projectExtracted, existingProject, 'project');

    // 3. Reinforce existing duplicates
    const toReinforce = [...globalDedup.reinforced, ...projectDedup.reinforced];
    for (const memory of toReinforce) {
        const newConfidence = reinforceConfidence(memory.confidence, memory.timesConfirmed);
        try {
            await updateMemory(uid, memory, {
                confidence: newConfidence,
                timesConfirmed: memory.timesConfirmed + 1,
                updatedAt: now(),
            });
        } catch (err) {
            console.warn('[Brain] Failed to reinforce memory:', memory.id, err);
        }
    }

    // 4. Create new memories
    const newMemories: Memory[] = [
        ...globalDedup.novel.map((ext) => toMemory(ext, event)),
        ...projectDedup.novel.map((ext) => toMemory(ext, event)),
    ];

    if (newMemories.length > 0) {
        try {
            await saveMemories(uid, newMemories);
        } catch (err) {
            console.warn('[Brain] Failed to save new memories:', err);
        }
    }

    return newMemories;
}

/** Convert an ExtractedMemory to a full Memory with ID and timestamps. */
function toMemory(ext: ExtractedMemory, event: RetainEvent): Memory {
    return {
        id: generateId(),
        scope: ext.scope,
        projectId: ext.scope === 'project' ? event.projectId : undefined,
        type: ext.type,
        content: ext.content,
        source: event.source,
        rawContext: event.content.slice(0, 500), // cap raw context
        entities: ext.entities,
        categories: ext.categories,
        keywords: ext.keywords,
        genre: ext.genre ?? event.genre,
        territory: ext.territory ?? event.territory,
        confidence: DEFAULT_CONFIDENCE,
        timesRecalled: 0,
        timesConfirmed: 0,
        timesContradicted: 0,
        sceneNumbers: ext.sceneNumbers,
        createdAt: now(),
        updatedAt: now(),
        archived: false,
    };
}

// ── REFLECT ─────────────────────────────────────────────────────────────

/**
 * Decay confidence on memories that haven't been recalled recently.
 * Archives memories that fall below the threshold.
 * Called periodically (e.g. on project open).
 */
export async function reflectDecay(memories: Memory[]): Promise<{
    updated: Memory[];
    archived: Memory[];
}> {
    const uid = getCurrentUid();
    if (!uid) return { updated: [], archived: [] };

    const updated: Memory[] = [];
    const toArchive: Memory[] = [];
    const currentTime = now();

    for (const memory of memories) {
        if (memory.archived) continue;

        const daysUnused = daysBetween(memory.lastRecalledAt ?? memory.createdAt, currentTime);

        // Only decay if unused for more than 30 days
        if (daysUnused < 30) continue;

        // Hindsight-style exponential decay
        const baseConfidence =
            (memory.timesConfirmed + 1) /
            (memory.timesConfirmed + memory.timesContradicted + 2);
        const decayedConfidence = Math.max(
            0.1,
            baseConfidence * Math.exp(-DECAY_RATE_PER_DAY * daysUnused),
        );

        if (decayedConfidence < ARCHIVE_THRESHOLD) {
            toArchive.push(memory);
        } else if (Math.abs(decayedConfidence - memory.confidence) > 0.02) {
            // Only update if meaningful change
            updated.push({ ...memory, confidence: decayedConfidence });
        }
    }

    // Batch update
    for (const memory of updated) {
        try {
            await updateMemory(uid, memory, {
                confidence: memory.confidence,
                updatedAt: currentTime,
            });
        } catch (err) {
            console.warn('[Brain] Decay update failed:', memory.id, err);
        }
    }

    // Archive decayed memories
    for (const memory of toArchive) {
        try {
            await archiveMemory(uid, memory);
        } catch (err) {
            console.warn('[Brain] Archive failed:', memory.id, err);
        }
    }

    return { updated, archived: toArchive };
}

/**
 * Record that a memory was recalled (used in an AI call).
 * Updates timesRecalled and lastRecalledAt.
 */
export function markRecalled(memories: ScoredMemory[]): void {
    const uid = getCurrentUid();
    if (!uid) return;

    const currentTime = now();
    for (const { memory } of memories) {
        updateMemory(uid, memory, {
            timesRecalled: memory.timesRecalled + 1,
            lastRecalledAt: currentTime,
            updatedAt: currentTime,
        }).catch((err) => {
            console.warn('[Brain] markRecalled failed:', memory.id, err);
        });
    }
}
