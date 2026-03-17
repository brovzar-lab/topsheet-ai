import { Routes, Route, useLocation } from 'react-router-dom';
import { Sidebar } from './components/layout/Sidebar';
import { ErrorBoundary } from './components/layout/ErrorBoundary';
import { DashboardPage } from './pages/DashboardPage';
import { ProjectNewPage } from './pages/ProjectNewPage';
import { ProjectPage } from './pages/ProjectPage';
import { BreakdownPage } from './pages/BreakdownPage';
import { SchedulePage } from './pages/SchedulePage';
import { BudgetPage } from './pages/BudgetPage';
import { DOODsPage } from './pages/DOODsPage';
import { ElementsPage } from './pages/ElementsPage';
import { CalendarPage } from './pages/CalendarPage';
import { SettingsPage } from './pages/SettingsPage';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';

export default function App() {
    const location = useLocation();
    const projectMatch = location.pathname.match(/^\/project\/([^/]+)/);
    const projectId = projectMatch?.[1];

    // Global keyboard shortcuts
    useKeyboardShortcuts(projectId && projectId !== 'new' ? projectId : undefined);

    return (
        <div className="flex h-screen overflow-hidden">
            <Sidebar />
            <main className="flex-1 overflow-y-auto">
                <Routes>
                    <Route path="/" element={<ProjectNewPage />} />
                    <Route path="/project/new" element={<ProjectNewPage />} />
                    <Route path="/settings" element={<SettingsPage />} />
                    <Route
                        path="/project/:id/*"
                        element={
                            <ErrorBoundary>
                                <Routes>
                                    <Route index element={<ProjectPage />} />
                                    <Route path="breakdown" element={<BreakdownPage />} />
                                    <Route path="schedule" element={<SchedulePage />} />
                                    <Route path="budget" element={<BudgetPage />} />
                                    <Route path="doods" element={<DOODsPage />} />
                                    <Route path="elements" element={<ElementsPage />} />
                                    <Route path="calendar" element={<CalendarPage />} />
                                </Routes>
                            </ErrorBoundary>
                        }
                    />
                </Routes>
            </main>
        </div>
    );
}
