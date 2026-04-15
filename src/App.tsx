import { useEffect, lazy, Suspense } from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { Sidebar } from './components/layout/Sidebar';
import { ErrorBoundary } from './components/layout/ErrorBoundary';
import { AuthGate } from './components/AuthGate';
import { Loader2 } from 'lucide-react';

// Route-level pages — lazy loaded so each route only ships what it needs
const HomeScreen = lazy(() => import('./pages/HomeScreen').then(m => ({ default: m.HomeScreen })));
const ProjectNewPage = lazy(() => import('./pages/ProjectNewPage').then(m => ({ default: m.ProjectNewPage })));
const ProjectPage = lazy(() => import('./pages/ProjectPage').then(m => ({ default: m.ProjectPage })));
const BreakdownPage = lazy(() => import('./pages/BreakdownPage').then(m => ({ default: m.BreakdownPage })));
const SchedulePage = lazy(() => import('./pages/SchedulePage').then(m => ({ default: m.SchedulePage })));
const BudgetPage = lazy(() => import('./pages/BudgetPage').then(m => ({ default: m.BudgetPage })));
const DOODsPage = lazy(() => import('./pages/DOODsPage').then(m => ({ default: m.DOODsPage })));
const ElementsPage = lazy(() => import('./pages/ElementsPage').then(m => ({ default: m.ElementsPage })));
const CalendarPage = lazy(() => import('./pages/CalendarPage').then(m => ({ default: m.CalendarPage })));
const SettingsPage = lazy(() => import('./pages/SettingsPage').then(m => ({ default: m.SettingsPage })));
const SeriesNewPage = lazy(() => import('./pages/SeriesNewPage').then(m => ({ default: m.SeriesNewPage })));
const SeriesDashboardPage = lazy(() => import('./pages/SeriesDashboardPage').then(m => ({ default: m.SeriesDashboardPage })));
const SeriesBudgetPage = lazy(() => import('./pages/SeriesBudgetPage').then(m => ({ default: m.SeriesBudgetPage })));
const SeriesMasterSchedulePage = lazy(() => import('./pages/SeriesMasterSchedulePage').then(m => ({ default: m.SeriesMasterSchedulePage })));
const SeriesRosterPage = lazy(() => import('./pages/SeriesRosterPage').then(m => ({ default: m.SeriesRosterPage })));
const EpisodeUploadPage = lazy(() => import('./pages/EpisodeUploadPage').then(m => ({ default: m.EpisodeUploadPage })));

function PageLoader() {
    return (
        <div className="flex h-full items-center justify-center">
            <Loader2 size={24} className="text-lemon-cyan animate-spin" />
        </div>
    );
}
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
            <a
                href="#main-content"
                className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[9999] focus:px-4 focus:py-2 focus:bg-lemon-cyan focus:text-lemon-black focus:font-mono focus:text-xs focus:rounded focus:uppercase focus:tracking-wider"
            >
                Skip to main content
            </a>
            <div className="flex h-screen overflow-hidden">
                <Sidebar />
                <main id="main-content" className="flex-1 overflow-y-auto">
                    <Suspense fallback={<PageLoader />}>
                    <Routes>
                        <Route path="/" element={<HomeScreen />} />
                        <Route path="/project/new" element={<ProjectNewPage />} />
                        <Route path="/settings" element={<SettingsPage />} />
                        <Route path="/series/new" element={<SeriesNewPage />} />
                        <Route
                            path="/series/:seriesId/*"
                            element={
                                <ErrorBoundary>
                                    <Routes>
                                        <Route index element={<SeriesDashboardPage />} />
                                        <Route path="budget" element={<SeriesBudgetPage />} />
                                        <Route path="schedule" element={<SeriesMasterSchedulePage />} />
                                        <Route path="roster" element={<SeriesRosterPage />} />
                                        <Route path="upload/:episodeId" element={<EpisodeUploadPage />} />
                                    </Routes>
                                </ErrorBoundary>
                            }
                        />
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
                    </Suspense>
                </main>
            </div>
        </AuthGate>
    );
}
