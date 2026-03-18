import { useParams, useSearchParams, Link, useLocation } from 'react-router-dom';
import { useSeriesStore } from '../stores/series-store';
import { useProjectStore } from '../stores/project-store';

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

    return (
        <div className="flex items-center gap-2 mb-4 font-mono text-xs tracking-wider">
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
    );
}
