import { NavLink, useLocation } from 'react-router-dom';
import {
    FilePlus,
    Settings,
    FileText,
    SplitSquareHorizontal,
    CalendarDays,
    DollarSign,
    Users,
    Package,
    Calendar,
} from 'lucide-react';

function ProjectNav({ projectId }: { projectId: string }) {
    return (
        <div className="mt-6 border-t border-lemon-gray-700 pt-4">
            <span className="lemon-label block px-4 mb-3 text-lemon-cyan">PROJECT</span>
            <NavLink
                to={`/project/${projectId}`}
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
                to={`/project/${projectId}/breakdown`}
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
                to={`/project/${projectId}/schedule`}
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
                to={`/project/${projectId}/budget`}
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
                to={`/project/${projectId}/doods`}
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
                to={`/project/${projectId}/elements`}
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
                to={`/project/${projectId}/calendar`}
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

export function Sidebar() {
    const location = useLocation();
    const projectMatch = location.pathname.match(/^\/project\/([^/]+)/);
    const projectId = projectMatch?.[1];
    // Don't show project nav for /project/new
    const showProjectNav = projectId && projectId !== 'new';

    return (
        <aside className="w-64 flex-shrink-0 bg-lemon-bg-primary lemon-textured border-r border-lemon-gray-700 flex flex-col h-full">
            {/* Logo */}
            <div className="p-5 border-b border-lemon-gray-700">
                <div className="flex items-center gap-3">
                    <img
                        src="/lemon-logo-cyan-800x800.png"
                        alt="Lemon Studios"
                        className="w-8 h-8"
                    />
                    <div>
                        <h1 className="font-display font-black text-sm tracking-wider text-lemon-text-primary leading-none">
                            LEMON
                        </h1>
                        <span className="font-mono text-[0.6rem] tracking-[0.2em] text-lemon-cyan uppercase">
                            BUDGET ENGINE
                        </span>
                    </div>
                </div>
            </div>

            {/* Main Nav */}
            <nav className="flex-1 py-4 overflow-y-auto">
                <span className="lemon-label block px-4 mb-3">NAVIGATION</span>
                <NavLink
                    to="/project/new"
                    className={({ isActive }) =>
                        `flex items-center gap-3 px-4 py-2.5 text-sm transition-colors ${isActive
                            ? 'text-lemon-cyan bg-lemon-cyan/10 border-l-3 border-lemon-cyan'
                            : 'text-lemon-gray-400 hover:text-lemon-text-body hover:bg-lemon-bg-elevated/50'
                        }`
                    }
                >
                    <FilePlus size={16} />
                    <span className="font-mono text-xs tracking-widest">NEW PROJECT</span>
                </NavLink>

                {showProjectNav && <ProjectNav projectId={projectId} />}
            </nav>

            {/* Footer — Settings gear + version */}
            <div className="p-4 border-t border-lemon-gray-700 flex items-center justify-between">
                <div>
                    <span className="font-mono text-[0.55rem] tracking-[0.15em] text-lemon-gray-500 uppercase">
                        LEMON STUDIOS © 2026
                    </span>
                    <span className="block font-mono text-[0.5rem] tracking-wider text-lemon-gray-600 mt-0.5">
                        v0.4.0
                    </span>
                </div>
                <NavLink
                    to="/settings"
                    title="Settings"
                    className={({ isActive }) =>
                        `p-2 rounded transition-colors ${isActive
                            ? 'text-lemon-cyan bg-lemon-cyan/10'
                            : 'text-lemon-gray-500 hover:text-lemon-text-body hover:bg-lemon-bg-elevated/50'
                        }`
                    }
                >
                    <Settings size={16} />
                </NavLink>
            </div>
        </aside>
    );
}
