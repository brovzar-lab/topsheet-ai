/**
 * agent-brain-store.ts — Persisted skill injection for Rafa and Sandra.
 *
 * Any .md or .txt file uploaded here is appended to that persona's system
 * prompt on every AI call they make — breakdown, chat, brainstorm, etc.
 *
 * Use getRafaSkillContext() / getSandraSkillContext() inside any system
 * prompt builder to inject the current skill set.
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface SkillFile {
    id: string;
    name: string;
    content: string;         // full text of the uploaded file
    uploadedAt: string;      // ISO timestamp
    sizeBytes: number;
}

type AgentKey = 'rafa' | 'sandra';

interface AgentBrainState {
    rafaSkills: SkillFile[];
    sandraSkills: SkillFile[];

    addSkill: (agent: AgentKey, file: SkillFile) => void;
    removeSkill: (agent: AgentKey, id: string) => void;
    clearSkills: (agent: AgentKey) => void;

    /** Returns a multi-line string ready to append to a system prompt. */
    getRafaSkillContext: () => string;
    getSandraSkillContext: () => string;
}

function buildContext(skills: SkillFile[]): string {
    if (skills.length === 0) return '';
    const sections = skills.map(
        (s) => `### Skill: ${s.name}\n${s.content.trim()}`
    );
    return [
        '\n\n---',
        '## Your Upgraded Skills & Expertise',
        'The following skills have been uploaded to enhance your capabilities.',
        'Apply this knowledge throughout all your responses and analysis.',
        '',
        ...sections,
    ].join('\n');
}

export const useAgentBrainStore = create<AgentBrainState>()(
    persist(
        (set, get) => ({
            rafaSkills: [],
            sandraSkills: [],

            addSkill: (agent, file) => {
                set((state) => ({
                    rafaSkills: agent === 'rafa' ? [...state.rafaSkills, file] : state.rafaSkills,
                    sandraSkills: agent === 'sandra' ? [...state.sandraSkills, file] : state.sandraSkills,
                }));
            },

            removeSkill: (agent, id) => {
                set((state) => ({
                    rafaSkills: agent === 'rafa' ? state.rafaSkills.filter((s) => s.id !== id) : state.rafaSkills,
                    sandraSkills: agent === 'sandra' ? state.sandraSkills.filter((s) => s.id !== id) : state.sandraSkills,
                }));
            },

            clearSkills: (agent) => {
                set(agent === 'rafa' ? { rafaSkills: [] } : { sandraSkills: [] });
            },

            getRafaSkillContext: () => buildContext(get().rafaSkills),
            getSandraSkillContext: () => buildContext(get().sandraSkills),
        }),
        {
            name: 'topsheet-agent-brains',
            version: 1,
        }
    )
);
