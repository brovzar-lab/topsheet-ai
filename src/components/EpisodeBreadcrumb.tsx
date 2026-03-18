import { useParams, useSearchParams, Link, useLocation } from 'react-router-dom';
import { useSeriesStore } from '../stores/series-store';
import { useProjectStore } from '../stores/project-store';
import { useBreakdownStore } from '../stores/breakdown-store';
import { useScheduleStore } from '../stores/schedule-store';
import { useBudgetStore } from '../stores/budget-store';
import { useAutosaveIndicator } from '../hooks/useAutosaveIndicator';

const TAB_LABELS: Record<string, string> = {
    breakdown: 'BREAKDOWN',
    schedule: 'SCHEDULE',
    budget: 'BUDGET',
    doods: 'DOODs',
    elements: 'ELEMENTS',
    calendar: 'CALENDAR',
    '': 'SCRIPT',
};

export function EpisodeBreadcrumb() {
    const { id: projectId } = useParams<{ id: string }>();
    const [searchParams] = useSearchParams();
    const location = useLocation();
    const seriesId = searchParams.get('seriesId');
    const airNumber = searchParams.get('airNumber');

    const activeSeries = useSeriesStore(s => s.activeSeries);
    const project = useProjectStore(s => projectId ? s.getProject(projectId) : undefined);

    // Only render in episode context
    if (!seriesId || !airNumber) return null;

    // Derive current tab from pathname
    const pathSegments = location.pathname.split('/');
    const lastSegment = pathSegments[pathSegments.length - 1];
    const tabLabel = TAB_LABELS[lastSegment] ?? 'SCRIPT';

    const seriesTitle = activeSeries?.title ?? 'Series';
    const episodeTitle = project?.title ?? `Episode ${airNumber}`;

    const breakdownSaved = useBreakdownStore(s => s.lastSavedAt);
    const scheduleSaved = useScheduleStore(s => s.lastSavedAt);
    const budgetSaved = useBudgetStore(s => s.lastSavedAt);
    const latestSave = Math.max(breakdownSaved ?? 0, scheduleSaved ?? 0, budgetSaved ?? 0) || null;
    const { showSaved } = useAutosaveIndicator(latestSave);

    return (
        <div className="flex items-center justify-between gap-2 mb-4 font-mono text-xs tracking-wider">
            <div className="flex items-center gap-2">
                <Link
                    to={`/series/${seriesId}`}
                    className="text-lemon-cyan hover:text-lemon-cyan-dim transition-colors uppercase"
                >
                    {seriesTitle}
                </Link>
                <span className="text-lemon-gray-600">→</span>
                <span className="text-lemon-text-muted uppercase">
                    Ep {String(airNumber).padStart(2, '0')}: {episodeTitle}
                </span>
                <span className="text-lemon-gray-600">→</span>
                <span className="text-lemon-text-primary uppercase">{tabLabel}</span>
            </div>
            <div className={`text-lemon-cyan transition-opacity duration-500 ${showSaved ? 'opacity-100' : 'opacity-0'}`}>
                Saved ✓
            </div>
        </div>
    );
}
