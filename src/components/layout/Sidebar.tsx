import { NavLink, Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import {
    Settings,
    FileText,
    SplitSquareHorizontal,
    CalendarDays,
    DollarSign,
    Users,
    Package,
    Calendar,
    Film,
    Tv,
    Trash2,
    X,
} from 'lucide-react';
import { useState } from 'react';
import { useProjectStore } from '@/stores/project-store';
import { useSeriesStore } from '@/stores/series-store';
import { useAuthStore } from '@/stores/auth-store';

// ── Helpers ──────────────────────────────────────────────────────────────────

function fmtDate(iso?: string): string {
    if (!iso) return '';
    const d = new Date(iso);
    return d.toLocaleDateString('en', { month: 'short', day: 'numeric', year: '2-digit' });
}

// ── Confirmation modal ────────────────────────────────────────────────────────

function DeleteModal({
    name,
    onConfirm,
    onCancel,
}: {
    name: string;
    onConfirm: () => void;
    onCancel: () => void;
}) {
    return (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/70 backdrop-blur-sm">
            <div className="w-80 bg-lemon-bg-secondary border border-lemon-coral/40 rounded-xl p-6 shadow-2xl">
                <div className="flex items-start justify-between mb-4">
                    <div className="flex items-center gap-2 text-lemon-coral">
                        <Trash2 size={16} />
                        <span className="font-display font-bold text-sm uppercase tracking-wider">Delete Project</span>
                    </div>
                    <button onClick={onCancel} className="text-lemon-gray-500 hover:text-lemon-text-primary transition-colors">
                        <X size={16} />
                    </button>
                </div>
                <p className="text-lemon-text-body text-sm font-body mb-1">
                    Are you sure you want to delete
                </p>
                <p className="text-lemon-text-primary font-display font-bold text-sm mb-5 truncate">
                    "{name}"?
                </p>
                <p className="text-lemon-text-muted text-xs font-mono mb-5">
                    This cannot be undone. All breakdown data, schedules, and budgets will be permanently removed.
                </p>
                <div className="flex gap-3">
                    <button
                        onClick={onCancel}
                        className="flex-1 py-2 rounded border border-lemon-gray-600 text-lemon-text-muted font-mono text-xs hover:border-lemon-gray-500 hover:text-lemon-text-body transition-colors"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={onConfirm}
                        className="flex-1 py-2 rounded bg-lemon-coral/15 border border-lemon-coral/50 text-lemon-coral font-mono text-xs font-bold hover:bg-lemon-coral/25 transition-colors"
                    >
                        Delete
                    </button>
                </div>
            </div>
        </div>
    );
}

// ── Project list ──────────────────────────────────────────────────────────────

function ProjectNav({ projectId, episodeSuffix }: { projectId: string; episodeSuffix: string }) {
    return (
        <div className="mt-6 border-t border-lemon-gray-700 pt-4" role="group" aria-label="Project pages">
            <span className="lemon-label block px-4 mb-3 text-lemon-cyan">PROJECT</span>
            <NavLink
                data-testid="nav-script"
                to={`/project/${projectId}${episodeSuffix}`}
                end
                className={({ isActive }) =>
                    `flex items-center gap-3 px-4 py-2.5 text-sm transition-colors ${isActive
                        ? 'text-lemon-cyan bg-lemon-cyan/10 border-l-3 border-lemon-cyan'
                        : 'text-lemon-gray-400 hover:text-lemon-text-body hover:bg-lemon-bg-elevated/50'
                    }`
                }
            >
                <FileText size={16} />
                <span className="font-mono text-xs tracking-widest uppercase">SCRIPT</span>
            </NavLink>
            <NavLink
                data-testid="nav-breakdown"
                to={`/project/${projectId}/breakdown${episodeSuffix}`}
                className={({ isActive }) =>
                    `flex items-center gap-3 px-4 py-2.5 text-sm transition-colors ${isActive
                        ? 'text-lemon-cyan bg-lemon-cyan/10 border-l-3 border-lemon-cyan'
                        : 'text-lemon-gray-400 hover:text-lemon-text-body hover:bg-lemon-bg-elevated/50'
                    }`
                }
            >
                <SplitSquareHorizontal size={16} />
                <span className="font-mono text-xs tracking-widest uppercase">BREAKDOWN</span>
            </NavLink>
            <NavLink
                data-testid="nav-schedule"
                to={`/project/${projectId}/schedule${episodeSuffix}`}
                className={({ isActive }) =>
                    `flex items-center gap-3 px-4 py-2.5 text-sm transition-colors ${isActive
                        ? 'text-lemon-cyan bg-lemon-cyan/10 border-l-3 border-lemon-cyan'
                        : 'text-lemon-gray-400 hover:text-lemon-text-body hover:bg-lemon-bg-elevated/50'
                    }`
                }
            >
                <CalendarDays size={16} />
                <span className="font-mono text-xs tracking-widest uppercase">SCHEDULE</span>
            </NavLink>
            <NavLink
                data-testid="nav-budget"
                to={`/project/${projectId}/budget${episodeSuffix}`}
                className={({ isActive }) =>
                    `flex items-center gap-3 px-4 py-2.5 text-sm transition-colors ${isActive
                        ? 'text-lemon-cyan bg-lemon-cyan/10 border-l-3 border-lemon-cyan'
                        : 'text-lemon-gray-400 hover:text-lemon-text-body hover:bg-lemon-bg-elevated/50'
                    }`
                }
            >
                <DollarSign size={16} />
                <span className="font-mono text-xs tracking-widest uppercase">BUDGET</span>
            </NavLink>
            <NavLink
                data-testid="nav-doods"
                to={`/project/${projectId}/doods${episodeSuffix}`}
                className={({ isActive }) =>
                    `flex items-center gap-3 px-4 py-2.5 text-sm transition-colors ${isActive
                        ? 'text-lemon-cyan bg-lemon-cyan/10 border-l-3 border-lemon-cyan'
                        : 'text-lemon-gray-400 hover:text-lemon-text-body hover:bg-lemon-bg-elevated/50'
                    }`
                }
            >
                <Users size={16} />
                <span className="font-mono text-xs tracking-widest uppercase">DOODs</span>
            </NavLink>
            <NavLink
                data-testid="nav-elements"
                to={`/project/${projectId}/elements${episodeSuffix}`}
                className={({ isActive }) =>
                    `flex items-center gap-3 px-4 py-2.5 text-sm transition-colors ${isActive
                        ? 'text-lemon-cyan bg-lemon-cyan/10 border-l-3 border-lemon-cyan'
                        : 'text-lemon-gray-400 hover:text-lemon-text-body hover:bg-lemon-bg-elevated/50'
                    }`
                }
            >
                <Package size={16} />
                <span className="font-mono text-xs tracking-widest uppercase">ELEMENTS</span>
            </NavLink>
            <NavLink
                data-testid="nav-calendar"
                to={`/project/${projectId}/calendar${episodeSuffix}`}
                className={({ isActive }) =>
                    `flex items-center gap-3 px-4 py-2.5 text-sm transition-colors ${isActive
                        ? 'text-lemon-cyan bg-lemon-cyan/10 border-l-3 border-lemon-cyan'
                        : 'text-lemon-gray-400 hover:text-lemon-text-body hover:bg-lemon-bg-elevated/50'
                    }`
                }
            >
                <Calendar size={16} />
                <span className="font-mono text-xs tracking-widest uppercase">CALENDAR</span>
            </NavLink>
        </div>
    );
}

function ProjectList({
    mode,
    currentProjectId,
    currentSeriesId,
}: {
    mode: 'film' | 'tv' | null;
    currentProjectId?: string;
    currentSeriesId?: string;
}) {
    const projects = useProjectStore((s) => s.projects);
    const { deleteProject } = useProjectStore();
    const allSeries = useSeriesStore((s) => s.allSeries);
    const { deleteSeries } = useSeriesStore();
    const user = useAuthStore((s) => s.user);
    const navigate = useNavigate();

    const [pending, setPending] = useState<{ id: string; name: string; kind: 'film' | 'tv' } | null>(null);

    if (!mode) return null;

    function handleDelete(id: string, name: string, kind: 'film' | 'tv') {
        setPending({ id, name, kind });
    }

    function confirmDelete() {
        if (!pending) return;
        if (pending.kind === 'film') {
            deleteProject(pending.id);
            if (currentProjectId === pending.id) navigate('/');
        } else {
            if (user?.uid) deleteSeries(user.uid, pending.id);
            if (currentSeriesId === pending.id) navigate('/');
        }
        setPending(null);
    }

    const navBase = (isActive: boolean) =>
        `group flex items-start gap-2.5 px-4 py-2 text-sm transition-colors w-full ${
            isActive
                ? 'text-lemon-cyan bg-lemon-cyan/10 border-l-3 border-lemon-cyan'
                : 'text-lemon-gray-400 hover:text-lemon-text-body hover:bg-lemon-bg-elevated/50'
        }`;

    if (mode === 'film') {
        if (projects.length === 0) return null;
        return (
            <>
                {pending && (
                    <DeleteModal
                        name={pending.name}
                        onConfirm={confirmDelete}
                        onCancel={() => setPending(null)}
                    />
                )}
                <div className="mt-4 border-t border-lemon-gray-700 pt-3">
                    <span className="lemon-label block px-4 mb-2">FEATURE FILMS</span>
                    {projects.map((p) => (
                        <div key={p.id} className="relative flex items-center group/item">
                            <NavLink
                                to={`/project/${p.id}/breakdown`}
                                className={() => navBase(currentProjectId === p.id)}
                            >
                                <Film size={13} className="flex-shrink-0 mt-0.5" />
                                <div className="min-w-0 flex-1">
                                    <div className="font-mono text-[0.65rem] tracking-wider truncate">{p.title}</div>
                                    {(p.updatedAt || p.createdAt) && (
                                        <div className="font-mono text-[0.55rem] text-lemon-gray-600 mt-0.5">
                                            {fmtDate(p.updatedAt ?? p.createdAt)}
                                        </div>
                                    )}
                                </div>
                            </NavLink>
                            {/* Delete button — visible on hover */}
                            <button
                                onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleDelete(p.id, p.title, 'film'); }}
                                aria-label="Delete project"
                                title="Delete project"
                                className="absolute right-2 opacity-0 group-hover/item:opacity-100 transition-opacity p-1 rounded text-lemon-gray-600 hover:text-lemon-coral hover:bg-lemon-coral/10"
                            >
                                <Trash2 size={11} />
                            </button>
                        </div>
                    ))}
                </div>
            </>
        );
    }

    if (allSeries.length === 0) return null;
    return (
        <>
            {pending && (
                <DeleteModal
                    name={pending.name}
                    onConfirm={confirmDelete}
                    onCancel={() => setPending(null)}
                />
            )}
            <div className="mt-4 border-t border-lemon-gray-700 pt-3">
                <span className="lemon-label block px-4 mb-2">TV SERIES</span>
                {allSeries.map((s) => (
                    <div key={s.id} className="relative flex items-center group/item">
                        <NavLink
                            to={`/series/${s.id}`}
                            className={() => navBase(currentSeriesId === s.id)}
                        >
                            <Tv size={13} className="flex-shrink-0 mt-0.5" />
                            <div className="min-w-0 flex-1">
                                <div className="font-mono text-[0.65rem] tracking-wider truncate">{s.title}</div>
                                {(s.updatedAt || s.createdAt) && (
                                    <div className="font-mono text-[0.55rem] text-lemon-gray-600 mt-0.5">
                                        {fmtDate(s.updatedAt ?? s.createdAt)}
                                    </div>
                                )}
                            </div>
                        </NavLink>
                        {/* Delete button — visible on hover */}
                        <button
                            onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleDelete(s.id, s.title, 'tv'); }}
                            aria-label="Delete series"
                            title="Delete series"
                            className="absolute right-2 opacity-0 group-hover/item:opacity-100 transition-opacity p-1 rounded text-lemon-gray-600 hover:text-lemon-coral hover:bg-lemon-coral/10"
                        >
                            <Trash2 size={11} />
                        </button>
                    </div>
                ))}
            </div>
        </>
    );
}

function SeriesNav({ seriesId }: { seriesId: string }) {
    return (
        <div className="mt-6 border-t border-lemon-gray-700 pt-4" role="group" aria-label="Series pages">
            <span className="lemon-label block px-4 mb-3 text-lemon-cyan">SERIES</span>
            <NavLink
                data-testid="nav-episodes"
                to={`/series/${seriesId}`}
                end
                className={({ isActive }) =>
                    `flex items-center gap-3 px-4 py-2.5 text-sm transition-colors ${isActive
                        ? 'text-lemon-cyan bg-lemon-cyan/10 border-l-3 border-lemon-cyan'
                        : 'text-lemon-gray-400 hover:text-lemon-text-body hover:bg-lemon-bg-elevated/50'
                    }`
                }
            >
                <SplitSquareHorizontal size={16} />
                <span className="font-mono text-xs tracking-widest uppercase">EPISODES</span>
            </NavLink>
            <NavLink
                data-testid="nav-series-budget"
                to={`/series/${seriesId}/budget`}
                className={({ isActive }) =>
                    `flex items-center gap-3 px-4 py-2.5 text-sm transition-colors ${isActive
                        ? 'text-lemon-cyan bg-lemon-cyan/10 border-l-3 border-lemon-cyan'
                        : 'text-lemon-gray-400 hover:text-lemon-text-body hover:bg-lemon-bg-elevated/50'
                    }`
                }
            >
                <DollarSign size={16} />
                <span className="font-mono text-xs tracking-widest uppercase">SERIES BUDGET</span>
            </NavLink>
            <NavLink
                data-testid="nav-master-schedule"
                to={`/series/${seriesId}/schedule`}
                className={({ isActive }) =>
                    `flex items-center gap-3 px-4 py-2.5 text-sm transition-colors ${isActive
                        ? 'text-lemon-cyan bg-lemon-cyan/10 border-l-3 border-lemon-cyan'
                        : 'text-lemon-gray-400 hover:text-lemon-text-body hover:bg-lemon-bg-elevated/50'
                    }`
                }
            >
                <CalendarDays size={16} />
                <span className="font-mono text-xs tracking-widest uppercase">MASTER SCHEDULE</span>
            </NavLink>
            <NavLink
                data-testid="nav-series-roster"
                to={`/series/${seriesId}/roster`}
                className={({ isActive }) =>
                    `flex items-center gap-3 px-4 py-2.5 text-sm transition-colors ${isActive
                        ? 'text-lemon-cyan bg-lemon-cyan/10 border-l-3 border-lemon-cyan'
                        : 'text-lemon-gray-400 hover:text-lemon-text-body hover:bg-lemon-bg-elevated/50'
                    }`
                }
            >
                <Users size={16} />
                <span className="font-mono text-xs tracking-widest uppercase">SERIES ROSTER</span>
            </NavLink>
        </div>
    );
}

export function Sidebar() {
    const location = useLocation();
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const episodeSeriesId = searchParams.get('seriesId');
    const episodeEpisodeId = searchParams.get('episodeId');
    const episodeAirNumber = searchParams.get('airNumber');
    const episodeSuffix = episodeSeriesId && episodeEpisodeId && episodeAirNumber
        ? `?seriesId=${episodeSeriesId}&episodeId=${episodeEpisodeId}&airNumber=${episodeAirNumber}`
        : '';

    const projectMatch = location.pathname.match(/^\/project\/([^/]+)/);
    const projectId = projectMatch?.[1];
    const showProjectNav = projectId && projectId !== 'new';

    const seriesMatch = location.pathname.match(/^\/series\/([^/]+)/);
    const seriesId = seriesMatch?.[1];
    const showSeriesNav = Boolean(seriesId && seriesId !== 'new');

    const isOnSettings = location.pathname === '/settings';

    function handleSettingsClick(e: React.MouseEvent) {
        e.preventDefault();
        if (isOnSettings) {
            navigate(-1);
        } else {
            navigate('/settings');
        }
    }

    return (
        <aside className="w-64 flex-shrink-0 bg-lemon-bg-primary lemon-textured border-r border-lemon-gray-700 flex flex-col h-full">
            {/* Logo — click to return to format selector */}
            <Link to="/" className="p-5 border-b border-lemon-gray-700 flex items-center gap-3 hover:bg-lemon-bg-elevated/40 transition-colors">
                <img
                    src="/topsheet-logo.png"
                    alt="Topsheet AI"
                    className="w-8 h-8 rounded"
                />
                <div className="flex items-baseline gap-1.5">
                    <h1 className="font-display font-black text-xl tracking-wider text-lemon-text-primary leading-none">
                        TOPSHEET
                    </h1>
                    <span className="font-mono text-sm tracking-[0.2em] text-lemon-cyan font-bold uppercase leading-none">
                        AI
                    </span>
                </div>
            </Link>

            {/* Main Nav */}
            <nav className="flex-1 py-4 overflow-y-auto" aria-label="Main navigation">
                <ProjectList
                    mode={projectId ? 'film' : seriesId ? 'tv' : null}
                    currentProjectId={projectId}
                    currentSeriesId={seriesId}
                />

                {showProjectNav && <ProjectNav projectId={projectId} episodeSuffix={episodeSuffix} />}
                {showSeriesNav && <SeriesNav seriesId={seriesId!} />}
            </nav>

            {/* Footer — Settings gear (toggles back) + version */}
            <div className="p-4 border-t border-lemon-gray-700 flex items-center justify-between">
                <div>
                    <span className="font-mono text-[0.55rem] tracking-[0.15em] text-lemon-gray-500 uppercase">
                        TOPSHEET AI © 2026
                    </span>
                    <span className="block font-mono text-[0.5rem] tracking-wider text-lemon-gray-600 mt-0.5">
                        v{typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '0.4.0'}
                    </span>
                </div>
                <button
                    data-testid="sidebar-settings-button"
                    onClick={handleSettingsClick}
                    aria-label={isOnSettings ? 'Go back' : 'Settings'}
                    title={isOnSettings ? 'Go back' : 'Settings'}
                    className={`p-2 rounded transition-colors ${isOnSettings
                        ? 'text-lemon-cyan bg-lemon-cyan/10'
                        : 'text-lemon-gray-500 hover:text-lemon-text-body hover:bg-lemon-bg-elevated/50'
                    }`}
                >
                    <Settings size={16} className={isOnSettings ? 'rotate-45 transition-transform' : 'transition-transform'} />
                </button>
            </div>
        </aside>
    );
}
