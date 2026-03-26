import { useEffect } from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { Sidebar } from './components/layout/Sidebar';
import { ErrorBoundary } from './components/layout/ErrorBoundary';
import { AuthGate } from './components/AuthGate';

import { HomeScreen } from './pages/HomeScreen';
import { ProjectNewPage } from './pages/ProjectNewPage';
import { ProjectPage } from './pages/ProjectPage';
import { BreakdownPage } from './pages/BreakdownPage';
import { SchedulePage } from './pages/SchedulePage';
import { BudgetPage } from './pages/BudgetPage';
import { DOODsPage } from './pages/DOODsPage';
import { ElementsPage } from './pages/ElementsPage';
import { CalendarPage } from './pages/CalendarPage';
import { SettingsPage } from './pages/SettingsPage';
import { SeriesNewPage } from './pages/SeriesNewPage';
import { SeriesDashboardPage } from './pages/SeriesDashboardPage';
import { SeriesBudgetPage } from './pages/SeriesBudgetPage';
import { SeriesMasterSchedulePage } from './pages/SeriesMasterSchedulePage';
import { SeriesRosterPage } from './pages/SeriesRosterPage';
import { EpisodeUploadPage } from './pages/EpisodeUploadPage';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';
import { useAuthStore } from './stores/auth-store';
import { useProjectStore } from './stores/project-store';
import { useSeriesStore } from './stores/series-store';
import { ProjectLoader } from './components/ProjectLoader';


const VALID_TABS = ['breakdown', 'schedule', 'budget', 'doods', 'elements', 'calendar'] as const;

/** Catch-all inside /project/:id/* — redirect any unknown tab to breakdown. */
function InvalidTabRedirect() {
    const location = useLocation();
    // Strip the trailing segment (the invalid tab) to get the project base path
    const basePath = location.pathname.replace(/\/[^/]*$/, '');
    return <Navigate to={`${basePath}/breakdown${location.search}`} replace />;
}

// VALID_TABS is used as an allowlist reference; the Route catch-all enforces it at the router level.
void VALID_TABS;

export default function App() {
    const location = useLocation();
    const projectMatch = location.pathname.match(/^\/project\/([^/]+)/);
    const projectId = projectMatch?.[1];
    const { user } = useAuthStore();
    const { loadFromFirestore } = useProjectStore();
    const { loadAllSeries } = useSeriesStore();

    // Load projects and series from Firestore whenever user signs in
    useEffect(() => {
        if (user?.uid) {
            loadFromFirestore(user.uid);
            loadAllSeries(user.uid);
        }
    }, [user?.uid, loadFromFirestore, loadAllSeries]);

    // Global keyboard shortcuts
    useKeyboardShortcuts(projectId && projectId !== 'new' ? projectId : undefined);

    return (
        <AuthGate>
            <div className="flex h-screen overflow-hidden">
                <Sidebar />
                <main className="flex-1 overflow-y-auto">
                    <Routes>
                        <Route path="/" element={<HomeScreen />} />
                        <Route path="/project/new" element={<ProjectNewPage />} />
                        <Route path="/settings" element={<SettingsPage />} />
                        <Route path="/series/new" element={<SeriesNewPage />} />
                        <Route path="/series/:seriesId/upload/:episodeId" element={<EpisodeUploadPage />} />
                        <Route path="/series/:seriesId" element={<SeriesDashboardPage />} />
                        <Route path="/series/:seriesId/budget" element={<SeriesBudgetPage />} />
                        <Route path="/series/:seriesId/schedule" element={<SeriesMasterSchedulePage />} />
                        <Route path="/series/:seriesId/roster" element={<SeriesRosterPage />} />
                        <Route
                            path="/project/:id/*"
                            element={
                                <ErrorBoundary>
                                    <ProjectLoader>
                                        <Routes>
                                            <Route index element={<ProjectPage />} />
                                            <Route path="breakdown" element={<BreakdownPage />} />
                                            <Route path="schedule" element={<SchedulePage />} />
                                            <Route path="budget" element={<BudgetPage />} />
                                            <Route path="doods" element={<DOODsPage />} />
                                            <Route path="elements" element={<ElementsPage />} />
                                            <Route path="calendar" element={<CalendarPage />} />
                                            <Route path="*" element={<InvalidTabRedirect />} />
                                        </Routes>
                                    </ProjectLoader>
                                </ErrorBoundary>
                            }
                        />
                    </Routes>
                </main>
            </div>
        </AuthGate>
    );
}
