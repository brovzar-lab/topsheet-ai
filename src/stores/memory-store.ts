/**
 * memory-store.ts — Zustand store for the Project Brain.
 *
 * Two isolated arrays: globalMemories (universal) + projectMemories (per-screenplay).
 * Pattern mirrors mpi-store.ts: in-memory cache + Firestore persistence.
 *
 * Key design: retain operations are fire-and-forget (async, never block UI).
 * Recall operations are synchronous (read from in-memory arrays).
 */

import { create } from 'zustand';
import type { Memory, RetainEvent, QueryContext, ScoredMemory } from '@/types/memory';
import type { BreakdownElement, Scene } from '@/types';
import type { ChatMessage } from '@/stores/chat-store';
import {
    loadGlobalMemories, loadProjectMemories,
    saveMemory, deleteProjectMemories as fsDeleteProjectMemories,
} from '@/lib/firestore/memories';
import {
    recall, formatForPrompt, retain, reflectDecay, markRecalled,
} from '@/lib/memory/brain-service';
import { getCurrentUid } from '@/lib/auth-state';

// ── Store Interface ─────────────────────────────────────────────────────

interface MemoryStoreState {
    globalMemories: Memory[];
    projectMemories: Memory[];
    isLoading: boolean;
    activeProjectId: string | null;
    lastReflectedAt: number | null;

    // ── Lifecycle ──
    loadGlobal: (uid: string) => Promise<void>;
    loadProject: (uid: string, projectId: string) => Promise<void>;
    loadAll: (uid: string, projectId: string) => Promise<void>;

    // ── Retain (write — async, fire-and-forget) ──
    retainFromChat: (agent: 'rafa' | 'sandra', message: string, projectId: string, genre?: string, territory?: string) => void;
    retainFromEdit: (sceneNumber: string, action: 'add' | 'remove', element: BreakdownElement, projectId: string) => void;
    retainFromBreakdownRun: (sceneCount: number, projectId: string) => void;

    // ── Recall (read — synchronous) ──
    recallForBreakdown: (scenes: Scene[]) => string;
    recallForAgent: (agent: 'rafa' | 'sandra') => string;

    // ── Reflect ──
    runReflection: () => Promise<void>;

    // ── Cleanup ──
    deleteProjectMemories: (uid: string, projectId: string) => Promise<void>;

    // ── Stats ──
    getMemoryCount: () => { global: number; project: number; total: number };
}

// ── Store ────────────────────────────────────────────────────────────────

export const useMemoryStore = create<MemoryStoreState>((set, get) => ({
    globalMemories: [],
    projectMemories: [],
    isLoading: false,
    activeProjectId: null,
    lastReflectedAt: null,

    // ── Lifecycle ────────────────────────────────────────────────────────

    loadGlobal: async (uid) => {
        try {
            const memories = await loadGlobalMemories(uid);
            set({ globalMemories: memories });
        } catch (err) {
            console.warn('[Brain] Failed to load global memories:', err);
        }
    },

    loadProject: async (uid, projectId) => {
        try {
            const memories = await loadProjectMemories(uid, projectId);
            set({ projectMemories: memories, activeProjectId: projectId });
        } catch (err) {
            console.warn('[Brain] Failed to load project memories:', err);
        }
    },

    loadAll: async (uid, projectId) => {
        set({ isLoading: true });
        await Promise.allSettled([
            get().loadGlobal(uid),
            get().loadProject(uid, projectId),
        ]);
        set({ isLoading: false });
    },

    // ── Retain ──────────────────────────────────────────────────────────

    retainFromChat: (agent, message, projectId, genre, territory) => {
        // Fire-and-forget — never block the UI
        const event: RetainEvent = {
            source: agent,
            projectId,
            content: message,
            genre,
            territory,
        };

        const { globalMemories, projectMemories } = get();

        retain(event, globalMemories, projectMemories)
            .then((newMemories) => {
                if (newMemories.length > 0) {
                    set((state) => ({
                        globalMemories: [
                            ...state.globalMemories,
                            ...newMemories.filter((m) => m.scope === 'global'),
                        ],
                        projectMemories: [
                            ...state.projectMemories,
                            ...newMemories.filter((m) => m.scope === 'project'),
                        ],
                    }));
                    console.log(`[Brain] Retained ${newMemories.length} new memories from ${agent}`);
                }
            })
            .catch((err) => {
                console.warn('[Brain] retainFromChat failed:', err);
            });
    },

    retainFromEdit: (sceneNumber, action, element, projectId) => {
        // Manual edits create project-scoped memories without an LLM call
        const uid = getCurrentUid();
        if (!uid) return;

        const content = action === 'add'
            ? `Scene ${sceneNumber} needs "${element.name}" under ${element.categoryId}`
            : `"${element.name}" was removed from Scene ${sceneNumber} (${element.categoryId}) — may not be needed`;

        const memory: Memory = {
            id: `mem_${crypto.randomUUID()}`,
            scope: 'project',
            projectId,
            type: 'fact',
            content,
            source: 'user_edit',
            entities: [element.name],
            categories: [element.categoryId],
            keywords: element.name.toLowerCase().split(/\s+/).filter((w) => w.length > 1),
            confidence: action === 'add' ? 0.85 : 0.6, // adds are more confident than removes
            timesRecalled: 0,
            timesConfirmed: action === 'add' ? 1 : 0,
            timesContradicted: action === 'remove' ? 1 : 0,
            sceneNumbers: [sceneNumber],
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            archived: false,
        };

        // Optimistic local update
        set((state) => ({
            projectMemories: [...state.projectMemories, memory],
        }));

        // Persist
        saveMemory(uid, memory).catch((err) => {
            console.warn('[Brain] retainFromEdit save failed:', err);
        });
    },

    retainFromBreakdownRun: (sceneCount, projectId) => {
        // After a breakdown run, we could extract patterns from what was tagged.
        // For now, just log it — the real learning happens when Rafa reviews.
        console.log(`[Brain] Breakdown completed: ${sceneCount} scenes in project ${projectId}`);
    },

    // ── Recall ──────────────────────────────────────────────────────────

    recallForBreakdown: (scenes) => {
        const { globalMemories, projectMemories } = get();

        // Build query context from all scenes being processed
        const allContent = scenes.map((s) => s.content).join('\n');
        const allKeywords = new Set<string>();
        const allEntities = new Set<string>();

        for (const scene of scenes) {
            // Extract location names from sluglines as entities
            if (scene.slugline?.location) {
                allEntities.add(scene.slugline.location);
            }
            // Extract keywords from content
            const words = scene.content.toLowerCase().split(/\s+/).filter((w) => w.length > 3);
            for (const w of words.slice(0, 50)) allKeywords.add(w);
        }

        const context: QueryContext = {
            sceneContent: allContent.slice(0, 5000), // cap for scoring
            keywords: [...allKeywords].slice(0, 100),
            entities: [...allEntities],
            categories: ['cast', 'extras', 'stunts', 'sfx', 'vfx', 'props', 'set_dressing',
                'vehicles', 'wardrobe', 'makeup_hair', 'animals', 'sound_music',
                'special_equipment', 'locations'],
        };

        const scored = recall(globalMemories, projectMemories, context);

        // Mark these memories as recalled (async, doesn't block)
        if (scored.length > 0) {
            markRecalled(scored);
        }

        return formatForPrompt(scored);
    },

    recallForAgent: (agent) => {
        const { globalMemories, projectMemories } = get();

        // For agents, recall broadly — they benefit from all context
        const context: QueryContext = {
            categories: ['cast', 'extras', 'stunts', 'sfx', 'vfx', 'props', 'set_dressing',
                'vehicles', 'wardrobe', 'makeup_hair', 'animals', 'sound_music',
                'special_equipment', 'locations', 'greenery', 'art_dept', 'security'],
        };

        const scored = recall(globalMemories, projectMemories, context, 10);

        if (scored.length > 0) {
            markRecalled(scored);
        }

        return formatForPrompt(scored);
    },

    // ── Reflect ─────────────────────────────────────────────────────────

    runReflection: async () => {
        const { globalMemories, projectMemories } = get();
        const allMemories = [...globalMemories, ...projectMemories];

        const result = await reflectDecay(allMemories);

        if (result.archived.length > 0 || result.updated.length > 0) {
            // Reload from Firestore to get fresh state
            const uid = getCurrentUid();
            const projectId = get().activeProjectId;
            if (uid && projectId) {
                await get().loadAll(uid, projectId);
            }
        }

        set({ lastReflectedAt: Date.now() });
        console.log(`[Brain] Reflection complete: ${result.updated.length} updated, ${result.archived.length} archived`);
    },

    // ── Cleanup ─────────────────────────────────────────────────────────

    deleteProjectMemories: async (uid, projectId) => {
        await fsDeleteProjectMemories(uid, projectId);
        set((state) => ({
            projectMemories: state.activeProjectId === projectId ? [] : state.projectMemories,
        }));
        console.log(`[Brain] Deleted all project memories for ${projectId}`);
    },

    // ── Stats ───────────────────────────────────────────────────────────

    getMemoryCount: () => {
        const { globalMemories, projectMemories } = get();
        return {
            global: globalMemories.length,
            project: projectMemories.length,
            total: globalMemories.length + projectMemories.length,
        };
    },
}));
