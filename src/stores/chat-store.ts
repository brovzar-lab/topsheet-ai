/**
 * chat-store.ts — Persistent store for Sandra + Rafa chat threads.
 *
 * Why Zustand instead of component state:
 *   Both panels live on separate pages (BreakdownPage / SchedulePage). When
 *   the user navigates away the component unmounts and React state is wiped.
 *   A Zustand store lives for the entire browser session, so conversations
 *   survive page navigation.
 *
 * Uses Zustand `persist` middleware to survive page refresh too.
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
// Store interface
// -----------------------------------------------------------------------

/** Max messages persisted per agent to avoid localStorage bloat. */
const MAX_PERSISTED_MESSAGES = 100;

interface ChatStore {
    // ── Persistent message threads ──────────────────────────────────────
    sandraMessages: ChatMessage[];
    rafaMessages: ChatMessage[];

    // ── Last-rendered system prompts (for cross-agent calls) ────────────
    // Each panel writes its system prompt here on every render so the
    // other agent can invoke it even when its panel is not mounted.
    sandraSystemPrompt: string;
    rafaSystemPrompt: string;

    // ── Setters ─────────────────────────────────────────────────────────
    setSandraMessages: (updater: ChatMessage[] | ((prev: ChatMessage[]) => ChatMessage[])) => void;
    setRafaMessages:  (updater: ChatMessage[] | ((prev: ChatMessage[]) => ChatMessage[])) => void;
    setSandraSystemPrompt: (prompt: string) => void;
    setRafaSystemPrompt:  (prompt: string) => void;
}

// -----------------------------------------------------------------------
// Store
// -----------------------------------------------------------------------

export const useChatStore = create<ChatStore>()(
    persist(
        (set) => ({
            sandraMessages: [],
            rafaMessages:  [],
            sandraSystemPrompt: '',
            rafaSystemPrompt:  '',

            setSandraMessages: (updater) =>
                set((state) => ({
                    sandraMessages: typeof updater === 'function' ? updater(state.sandraMessages) : updater,
                })),

            setRafaMessages: (updater) =>
                set((state) => ({
                    rafaMessages: typeof updater === 'function' ? updater(state.rafaMessages) : updater,
                })),

            setSandraSystemPrompt: (prompt) => set({ sandraSystemPrompt: prompt }),
            setRafaSystemPrompt:  (prompt) => set({ rafaSystemPrompt:  prompt }),
        }),
        {
            name: 'lemon-chat-threads',
            // Only persist message arrays — system prompts are runtime-only
            partialize: (state) => ({
                sandraMessages: state.sandraMessages.slice(-MAX_PERSISTED_MESSAGES),
                rafaMessages:   state.rafaMessages.slice(-MAX_PERSISTED_MESSAGES),
            }),
        },
    ),
);
