import { create } from 'zustand';
import type { Series, Episode, CreateSeriesInput, RosterEntry } from '@/types/series';
import {
    createSeries as fsCreateSeries,
    getAllSeries,
    updateSeries as fsUpdateSeries,
    createEpisodes as fsCreateEpisodes,
    getEpisodes,
    updateEpisode as fsUpdateEpisode,
} from '@/lib/firestore/series';

interface SeriesState {
    allSeries: Series[];
    activeSeries: Series | null;
    episodes: Episode[];
    isLoading: boolean;
    /** Separate flag so the dashboard shows a spinner until BOTH series and episodes resolve */
    isLoadingEpisodes: boolean;
    error: string | null;

    createSeries: (uid: string, input: CreateSeriesInput) => Promise<string>;
    loadAllSeries: (uid: string) => Promise<void>;
    loadSeries: (uid: string, seriesId: string) => Promise<void>;
    updateSeries: (uid: string, seriesId: string, data: Partial<Series>) => void;
    loadEpisodes: (uid: string, seriesId: string) => Promise<void>;
    updateEpisode: (uid: string, seriesId: string, episodeId: string, data: Partial<Episode>) => void;
    linkEpisodeToProject: (uid: string, seriesId: string, episodeId: string, projectId: string) => void;
    clearActiveSeries: () => void;

    rosterEntries: RosterEntry[];
    isLoadingRoster: boolean;
    loadRoster: (uid: string, seriesId: string) => Promise<void>;
}

export const useSeriesStore = create<SeriesState>((set, get) => ({
    allSeries: [],
    activeSeries: null,
    episodes: [],
    isLoading: false,
    isLoadingEpisodes: false,
    error: null,

    createSeries: async (uid, input) => {
        const series = await fsCreateSeries(uid, input);
        const episodes = await fsCreateEpisodes(uid, series.id, input.episodeCount, input.pilotDesignated);

        set((state) => ({
            allSeries: [series, ...state.allSeries],
            activeSeries: series,
            episodes,
        }));

        return series.id;
    },

    loadAllSeries: async (uid) => {
        set({ isLoading: true, error: null });
        try {
            const series = await getAllSeries(uid);
            set({ allSeries: series, isLoading: false });
        } catch (e) {
            set({ error: String(e), isLoading: false });
        }
    },

    loadSeries: async (uid, seriesId) => {
        set({ isLoading: true, error: null });
        try {
            const allSeries = get().allSeries;
            let series = allSeries.find((s) => s.id === seriesId) ?? null;
            if (!series) {
                const { getSeries } = await import('@/lib/firestore/series');
                series = await getSeries(uid, seriesId);
            }
            set({ activeSeries: series, isLoading: false });
        } catch (e) {
            set({ error: String(e), isLoading: false });
        }
    },

    updateSeries: (uid, seriesId, data) => {
        set((state) => ({
            activeSeries:
                state.activeSeries?.id === seriesId
                    ? { ...state.activeSeries, ...data, updatedAt: new Date().toISOString() }
                    : state.activeSeries,
            allSeries: state.allSeries.map((s) =>
                s.id === seriesId ? { ...s, ...data, updatedAt: new Date().toISOString() } : s
            ),
        }));
        // Fire-and-forget — UI updates instantly, Firestore catches up async
        fsUpdateSeries(uid, seriesId, data).catch(console.error);
    },

    loadEpisodes: async (uid, seriesId) => {
        set({ isLoadingEpisodes: true, error: null });
        try {
            const episodes = await getEpisodes(uid, seriesId);
            set({ episodes, isLoadingEpisodes: false });
        } catch (e) {
            set({ error: String(e), isLoadingEpisodes: false });
        }
    },

    updateEpisode: (uid, seriesId, episodeId, data) => {
        set((state) => ({
            episodes: state.episodes.map((ep) =>
                ep.id === episodeId ? { ...ep, ...data, updatedAt: new Date().toISOString() } : ep
            ),
        }));
        // Fire-and-forget — UI updates instantly, Firestore catches up async
        fsUpdateEpisode(uid, seriesId, episodeId, data).catch(console.error);
    },

    linkEpisodeToProject: (uid, seriesId, episodeId, projectId) => {
        get().updateEpisode(uid, seriesId, episodeId, {
            projectId,
            status: 'in_progress',
        });
    },

    clearActiveSeries: () => {
        set({ activeSeries: null, episodes: [] });
    },

    rosterEntries: [],
    isLoadingRoster: false,

    loadRoster: async (uid, seriesId) => {
        set({ isLoadingRoster: true });
        try {
            const { getRosterEntries } = await import('@/lib/firestore/series');
            const entries = await getRosterEntries(uid, seriesId);
            set({ rosterEntries: entries, isLoadingRoster: false });
        } catch {
            set({ isLoadingRoster: false });
        }
    },
}));


