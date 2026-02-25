import { Link } from 'react-router-dom';
import { FilePlus, FolderOpen } from 'lucide-react';
import { useProjectStore } from '@/stores/project-store';

export function DashboardPage() {
    const projects = useProjectStore((s) => s.projects);

    return (
        <div className="p-8 max-w-5xl mx-auto">
            <h1 className="mb-2">Dashboard</h1>
            <p className="text-lemon-text-muted font-body text-sm mb-8">
                Upload, break down, and budget your screenplays.
            </p>

            {projects.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-24 border border-dashed border-lemon-gray-700 rounded-lg bg-lemon-bg-secondary/50">
                    <FolderOpen size={48} className="text-lemon-gray-500 mb-4" />
                    <h3 className="text-lemon-text-body mb-2">No projects yet</h3>
                    <p className="text-lemon-text-muted text-sm mb-6">
                        Upload a screenplay to get started.
                    </p>
                    <Link
                        to="/project/new"
                        className="flex items-center gap-2 px-6 py-3 bg-lemon-cyan text-lemon-black font-display font-bold text-sm uppercase tracking-wider rounded hover:bg-lemon-cyan-dim transition-colors"
                    >
                        <FilePlus size={16} />
                        New Project
                    </Link>
                </div>
            ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {projects.map((project) => (
                        <Link
                            key={project.id}
                            to={`/project/${project.id}`}
                            className="group block p-5 bg-lemon-bg-secondary border border-lemon-gray-700 rounded-lg hover:border-lemon-cyan/40 hover:lemon-glow-cyan transition-all"
                        >
                            <h3 className="text-lemon-text-primary group-hover:text-lemon-cyan transition-colors mb-1">
                                {project.title}
                            </h3>
                            <div className="flex gap-4 text-xs">
                                <span className="lemon-label">{project.sceneCount} scenes</span>
                                <span className="lemon-label">{project.tier}</span>
                            </div>
                            <div className="mt-3 text-xs text-lemon-text-muted">
                                {new Date(project.createdAt).toLocaleDateString()}
                            </div>
                        </Link>
                    ))}
                </div>
            )}
        </div>
    );
}
