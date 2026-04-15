import { create } from 'zustand';
import { persist } from 'zustand/middleware';

// -----------------------------------------------------------------------
// Model configuration
// -----------------------------------------------------------------------

/** Task roles that can have independent model assignments */
export type TaskRole =
    | 'scriptAnalysis'
    | 'sceneBreakdown'
    | 'sandra'
    | 'rafa'
    | 'brainstorm'
    | 'mpiLearner';

/** Available models — `value` is exactly what callLLM() sends to LiteLLM */
export const MODEL_OPTIONS = [
    { value: 'gemini-2.5-flash',                     label: 'Gemini 2.5 Flash',  provider: 'google'    as const },
    { value: 'gemini-large-context',                  label: 'Gemini 2.5 Pro',    provider: 'google'    as const },
    { value: 'gemini-flash-fallback',                 label: 'Gemini 2.0 Flash',  provider: 'google'    as const },
    { value: 'anthropic/claude-sonnet-4-20250514',    label: 'Claude Sonnet 4',   provider: 'anthropic' as const },
] as const;

/** Human-readable labels for each task role */
export const TASK_ROLE_LABELS: Record<TaskRole, string> = {
    scriptAnalysis: 'Script Analysis',
    sceneBreakdown: 'Scene Breakdown',
    sandra:         'Sandra (Line Producer)',
    rafa:           'Rafa (1st AD)',
    brainstorm:     'Brainstorm',
    mpiLearner:     'MPI Learner',
};

// -----------------------------------------------------------------------
// Store interface
// -----------------------------------------------------------------------

interface SettingsState {
    // API keys
    geminiApiKey: string;
    anthropicApiKey: string;

    // Model selection
    defaultModel: string;
    modelOverrides: Partial<Record<TaskRole, string>>;

    // General preferences
    exchangeRate: number;
    defaultLanguage: 'en' | 'es';
    defaultContingencyPercent: number;

    // Actions — API keys
    setGeminiApiKey: (key: string) => void;
    setAnthropicApiKey: (key: string) => void;

    // Actions — models
    setDefaultModel: (model: string) => void;
    setModelOverride: (role: TaskRole, model: string | null) => void;
    getModelForRole: (role: TaskRole) => string;

    // Actions — preferences
    setExchangeRate: (rate: number) => void;
    setDefaultLanguage: (lang: 'en' | 'es') => void;
    setDefaultContingencyPercent: (percent: number) => void;
}

// -----------------------------------------------------------------------
// Store
// -----------------------------------------------------------------------

export const useSettingsStore = create<SettingsState>()(
    persist(
        (set, get) => ({
            // API keys — seeded from env vars
            geminiApiKey: import.meta.env.VITE_GEMINI_API_KEY ?? '',
            anthropicApiKey: import.meta.env.VITE_ANTHROPIC_API_KEY ?? '',

            // Model selection
            defaultModel: 'gemini-2.5-flash',
            modelOverrides: {},

            // Preferences
            exchangeRate: 17.5,
            defaultLanguage: 'en',
            defaultContingencyPercent: 10,

            // Setters — API keys
            setGeminiApiKey: (key) => set({ geminiApiKey: key }),
            setAnthropicApiKey: (key) => set({ anthropicApiKey: key }),

            // Setters — models
            setDefaultModel: (model) => set({ defaultModel: model }),
            setModelOverride: (role, model) =>
                set((state) => {
                    const next = { ...state.modelOverrides };
                    if (model === null) {
                        delete next[role];
                    } else {
                        next[role] = model;
                    }
                    return { modelOverrides: next };
                }),

            /** Resolve model for a task: override wins, then default */
            getModelForRole: (role) => {
                const state = get();
                return state.modelOverrides[role] ?? state.defaultModel;
            },

            // Setters — preferences
            setExchangeRate: (rate) => set({ exchangeRate: rate }),
            setDefaultLanguage: (lang) => set({ defaultLanguage: lang }),
            setDefaultContingencyPercent: (percent) => set({ defaultContingencyPercent: percent }),
        }),
        {
            name: 'topsheet-settings',
            partialize: (state) => {
                // Exclude API keys from localStorage — re-seeded from env on reload
                // eslint-disable-next-line @typescript-eslint/no-unused-vars
                const { geminiApiKey, anthropicApiKey, ...rest } = state;
                return rest;
            },
        },
    ),
);
