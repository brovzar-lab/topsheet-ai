/**
 * chat-store.ts — Persistent store for Sandra + Rafa chat threads.
 *
 * Messages are scoped per-project: each projectId gets its own thread.
 * This ensures that switching between movies shows the correct conversation
 * and agents don't confuse context from different screenplays.
 *
 * Uses Zustand `persist` middleware to survive page refresh.
 * System prompts are excluded from persistence — they're rebuilt every render.
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

// -----------------------------------------------------------------------
// Shared message type (imported by both panels)
// -----------------------------------------------------------------------

export interface CrossAgentRelay {
    /** Which agent produced this relay message */
    from: 'sandra' | 'rafa';
    /** The question that was sent to the other agent */
    question: string;
    /** True while the cross-consult Gemini call is in-flight */
    loading?: boolean;
}

/** Base message shape shared across both agents. */
export interface ChatMessage {
    role: 'user' | 'assistant';
    content: string;
    /** Panel-specific action objects (SandraAction[] | RafaAction[]).
     *  Typed as unknown[] here, cast in each panel. */
    actions?: unknown[];
    /** Present only on relay messages produced by cross-agent consults. */
    crossAgent?: CrossAgentRelay;
}

// -----------------------------------------------------------------------
// Constants
// -----------------------------------------------------------------------

/** Max messages persisted per agent per project to avoid localStorage bloat. */
const MAX_PERSISTED_MESSAGES = 100;

/** Max projects to keep in localStorage. Oldest threads are evicted. */
const MAX_PERSISTED_PROJECTS = 20;

/** Stable empty array — prevents new-reference-per-render for empty threads. */
const EMPTY_THREAD: ChatMessage[] = [];

// -----------------------------------------------------------------------
// Store interface
// -----------------------------------------------------------------------

interface ChatStore {
    // ── Per-project message threads ─────────────────────────────────────
    sandraThreads: Record<string, ChatMessage[]>;
    rafaThreads: Record<string, ChatMessage[]>;

    // ── LRU tracking — most recent projectIds first ─────────────────────
    recentProjectIds: string[];

    // ── Last-rendered system prompts (for cross-agent calls) ────────────
    // Each panel writes its system prompt here on every render so the
    // other agent can invoke it even when its panel is not mounted.
    sandraSystemPrompt: string;
    rafaSystemPrompt: string;

    // ── Getters (stable empty sentinel for unused projects) ─────────────
    getSandraMessages: (projectId: string) => ChatMessage[];
    getRafaMessages: (projectId: string) => ChatMessage[];

    // ── Setters ─────────────────────────────────────────────────────────
    setSandraMessages: (projectId: string, updater: ChatMessage[] | ((prev: ChatMessage[]) => ChatMessage[])) => void;
    setRafaMessages: (projectId: string, updater: ChatMessage[] | ((prev: ChatMessage[]) => ChatMessage[])) => void;
    setSandraSystemPrompt: (prompt: string) => void;
    setRafaSystemPrompt: (prompt: string) => void;

    // ── Cleanup ─────────────────────────────────────────────────────────
    clearThread: (agent: 'sandra' | 'rafa', projectId: string) => void;
    clearAllThreads: () => void;
}

// -----------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------

/** Touch a projectId to the front of the LRU list. */
function touchLRU(list: string[], projectId: string): string[] {
    const filtered = list.filter(id => id !== projectId);
    return [projectId, ...filtered];
}

/** Evict oldest projects beyond MAX_PERSISTED_PROJECTS from threads. */
function evictOldProjects(
    threads: Record<string, ChatMessage[]>,
    recentIds: string[],
): Record<string, ChatMessage[]> {
    if (recentIds.length <= MAX_PERSISTED_PROJECTS) return threads;
    const keepSet = new Set(recentIds.slice(0, MAX_PERSISTED_PROJECTS));
    const result: Record<string, ChatMessage[]> = {};
    for (const [pid, msgs] of Object.entries(threads)) {
        if (keepSet.has(pid)) result[pid] = msgs;
    }
    return result;
}

// -----------------------------------------------------------------------
// Store
// -----------------------------------------------------------------------

export const useChatStore = create<ChatStore>()(
    persist(
        (set, get) => ({
            sandraThreads: {},
            rafaThreads: {},
            recentProjectIds: [],
            sandraSystemPrompt: '',
            rafaSystemPrompt: '',

            getSandraMessages: (projectId) => {
                return get().sandraThreads[projectId] ?? EMPTY_THREAD;
            },

            getRafaMessages: (projectId) => {
                return get().rafaThreads[projectId] ?? EMPTY_THREAD;
            },

            setSandraMessages: (projectId, updater) =>
                set((state) => {
                    const prev = state.sandraThreads[projectId] ?? EMPTY_THREAD;
                    const next = typeof updater === 'function' ? updater(prev) : updater;
                    return {
                        sandraThreads: { ...state.sandraThreads, [projectId]: next },
                        recentProjectIds: touchLRU(state.recentProjectIds, projectId),
                    };
                }),

            setRafaMessages: (projectId, updater) =>
                set((state) => {
                    const prev = state.rafaThreads[projectId] ?? EMPTY_THREAD;
                    const next = typeof updater === 'function' ? updater(prev) : updater;
                    return {
                        rafaThreads: { ...state.rafaThreads, [projectId]: next },
                        recentProjectIds: touchLRU(state.recentProjectIds, projectId),
                    };
                }),

            setSandraSystemPrompt: (prompt) => set({ sandraSystemPrompt: prompt }),
            setRafaSystemPrompt: (prompt) => set({ rafaSystemPrompt: prompt }),

            clearThread: (agent, projectId) =>
                set((state) => {
                    const key = agent === 'sandra' ? 'sandraThreads' : 'rafaThreads';
                    const threads = { ...state[key] };
                    delete threads[projectId];
                    return { [key]: threads };
                }),

            clearAllThreads: () =>
                set({
                    sandraThreads: {},
                    rafaThreads: {},
                    recentProjectIds: [],
                }),
        }),
        {
            name: 'lemon-chat-threads',
            version: 2, // Bump: v1 had global arrays, v2 has per-project Records
            // Only persist message threads + LRU — system prompts are runtime-only
            partialize: (state) => {
                const keepIds = state.recentProjectIds.slice(0, MAX_PERSISTED_PROJECTS);

                // Cap each project's messages
                const capThreads = (threads: Record<string, ChatMessage[]>) => {
                    const result: Record<string, ChatMessage[]> = {};
                    for (const pid of keepIds) {
                        const msgs = threads[pid];
                        if (msgs && msgs.length > 0) {
                            result[pid] = msgs.slice(-MAX_PERSISTED_MESSAGES);
                        }
                    }
                    return result;
                };

                return {
                    sandraThreads: capThreads(evictOldProjects(state.sandraThreads, keepIds)),
                    rafaThreads: capThreads(evictOldProjects(state.rafaThreads, keepIds)),
                    recentProjectIds: keepIds,
                };
            },
            // Migrate v1 global arrays → v2 per-project Records
            migrate: (persisted: unknown, version: number) => {
                if (version < 2) {
                    const old = persisted as {
                        sandraMessages?: ChatMessage[];
                        rafaMessages?: ChatMessage[];
                    };
                    // Can't scope old messages to a project — just drop them
                    return {
                        sandraThreads: {},
                        rafaThreads: {},
                        recentProjectIds: [],
                        sandraSystemPrompt: '',
                        rafaSystemPrompt: '',
                        ...(old.sandraMessages ? {} : {}), // acknowledge old data exists
                    };
                }
                return persisted;
            },
        },
    ),
);
