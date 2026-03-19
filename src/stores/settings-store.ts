import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface SettingsState {
    geminiApiKey: string;
    exchangeRate: number;
    defaultLanguage: 'en' | 'es';
    defaultContingencyPercent: number;
    setGeminiApiKey: (key: string) => void;
    setExchangeRate: (rate: number) => void;
    setDefaultLanguage: (lang: 'en' | 'es') => void;
    setDefaultContingencyPercent: (percent: number) => void;
}

export const useSettingsStore = create<SettingsState>()(
    persist(
        (set) => ({
            // Seed from env var if no key is stored yet (personal-tool convenience)
            geminiApiKey: import.meta.env.VITE_GEMINI_API_KEY ?? '',
            exchangeRate: 17.5,
            defaultLanguage: 'en',
            defaultContingencyPercent: 10,

            setGeminiApiKey: (key) => set({ geminiApiKey: key }),
            setExchangeRate: (rate) => set({ exchangeRate: rate }),
            setDefaultLanguage: (lang) => set({ defaultLanguage: lang }),
            setDefaultContingencyPercent: (percent) => set({ defaultContingencyPercent: percent }),
        }),
        { name: 'topsheet-settings',
          partialize: (state) => {
              // Exclude API key from localStorage — re-seeded from env on reload
              // eslint-disable-next-line @typescript-eslint/no-unused-vars
              const { geminiApiKey, ...rest } = state;
              return rest;
          },
        }
    )
);
