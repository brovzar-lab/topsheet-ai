/**
 * chat-store.ts — Persistent in-memory store for Sandra + Rafa chat threads.
 *
 * Why Zustand instead of component state:
 *   Both panels live on separate pages (BreakdownPage / SchedulePage). When
 *   the user navigates away the component unmounts and React state is wiped.
 *   A Zustand store lives for the entire browser session, so conversations
 *   survive page navigation without any persistence middleware.
 *
 * Also stores the last-rendered system prompt for each agent so that
 * cross-agent consults can invoke the other AI even when its panel is unmounted.
 */

import { create } from 'zustand';

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

export const useChatStore = create<ChatStore>((set) => ({
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
}));
