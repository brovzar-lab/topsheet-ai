import { Routes, Route, useLocation } from 'react-router-dom';
import { Sidebar } from './components/layout/Sidebar';
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
                    <Route path="/" element={<DashboardPage />} />
                    <Route path="/project/new" element={<ProjectNewPage />} />
                    <Route path="/project/:id" element={<ProjectPage />} />
                    <Route path="/project/:id/breakdown" element={<BreakdownPage />} />
                    <Route path="/project/:id/schedule" element={<SchedulePage />} />
                    <Route path="/project/:id/budget" element={<BudgetPage />} />
                    <Route path="/project/:id/doods" element={<DOODsPage />} />
                    <Route path="/project/:id/elements" element={<ElementsPage />} />
                    <Route path="/project/:id/calendar" element={<CalendarPage />} />
                    <Route path="/settings" element={<SettingsPage />} />
                </Routes>
            </main>
        </div>
    );
}
