/**
 * agent-brain-store.ts — Persisted skill injection for Rafa and Sandra.
 *
 * V1 skills are built into the app — agents always have brains.
 * Users can upload additional skills (merged) or replace V1 entirely.
 *
 * Use getRafaSkillContext() / getSandraSkillContext() inside any system
 * prompt builder to inject the current skill set (built-in + uploaded).
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { RAFA_V1_SKILL_NAME, RAFA_V1_SKILL_CONTENT, RAFA_V1_SIZE_BYTES } from '@/data/rafa-default-skill';
import { SANDRA_V1_SKILL_NAME, SANDRA_V1_SKILL_CONTENT, SANDRA_V1_SIZE_BYTES } from '@/data/sandra-default-skill';

export interface SkillFile {
    id: string;
    name: string;
    content: string;         // full text of the uploaded file
    uploadedAt: string;      // ISO timestamp
    sizeBytes: number;
    /** True for hardcoded V1 skills — cannot be deleted, only replaced. */
    builtIn?: boolean;
}

type AgentKey = 'rafa' | 'sandra';

// ── Built-in V1 skill objects ───────────────────────────────────────────

const RAFA_V1: SkillFile = {
    id: 'built-in-rafa-v1',
    name: RAFA_V1_SKILL_NAME,
    content: RAFA_V1_SKILL_CONTENT,
    uploadedAt: '2026-03-27T00:00:00Z',
    sizeBytes: RAFA_V1_SIZE_BYTES,
    builtIn: true,
};

const SANDRA_V1: SkillFile = {
    id: 'built-in-sandra-v1',
    name: SANDRA_V1_SKILL_NAME,
    content: SANDRA_V1_SKILL_CONTENT,
    uploadedAt: '2026-03-27T00:00:00Z',
    sizeBytes: SANDRA_V1_SIZE_BYTES,
    builtIn: true,
};

// ── Store ───────────────────────────────────────────────────────────────

interface AgentBrainState {
    // User-uploaded skills only (V1 built-ins are added at runtime)
    rafaSkills: SkillFile[];
    sandraSkills: SkillFile[];

    /** When true, V1 has been replaced by an uploaded skill. */
    rafaV1Replaced: boolean;
    sandraV1Replaced: boolean;

    addSkill: (agent: AgentKey, file: SkillFile) => void;
    removeSkill: (agent: AgentKey, id: string) => void;
    clearSkills: (agent: AgentKey) => void;
    replaceV1: (agent: AgentKey) => void;
    restoreV1: (agent: AgentKey) => void;

    /** Get all effective skills (built-in V1 + uploaded). */
    getAllSkills: (agent: AgentKey) => SkillFile[];

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
            rafaV1Replaced: false,
            sandraV1Replaced: false,

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

            replaceV1: (agent) => {
                set(agent === 'rafa' ? { rafaV1Replaced: true } : { sandraV1Replaced: true });
            },

            restoreV1: (agent) => {
                set(agent === 'rafa' ? { rafaV1Replaced: false } : { sandraV1Replaced: false });
            },

            getAllSkills: (agent) => {
                const state = get();
                const isRafa = agent === 'rafa';
                const uploaded = isRafa ? state.rafaSkills : state.sandraSkills;
                const v1Replaced = isRafa ? state.rafaV1Replaced : state.sandraV1Replaced;
                const v1 = isRafa ? RAFA_V1 : SANDRA_V1;
                return v1Replaced ? uploaded : [v1, ...uploaded];
            },

            getRafaSkillContext: () => buildContext(get().getAllSkills('rafa')),
            getSandraSkillContext: () => buildContext(get().getAllSkills('sandra')),
        }),
        {
            name: 'topsheet-agent-brains',
            version: 2,
        },
    ),
);
