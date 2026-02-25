import { useState } from 'react';
import { Link } from 'react-router-dom';
import { FilePlus, FolderOpen, Trash2 } from 'lucide-react';
import { useProjectStore } from '@/stores/project-store';
import { useSceneStore } from '@/stores/scene-store';
import { useScheduleStore } from '@/stores/schedule-store';
import { useBudgetStore } from '@/stores/budget-store';

export function DashboardPage() {
    const projects = useProjectStore((s) => s.projects);
    const deleteProject = useProjectStore((s) => s.deleteProject);
    const clearScenes = useSceneStore((s) => s.clearScenes);
    const clearSchedule = useScheduleStore((s) => s.clearSchedule);
    const deleteDrafts = useBudgetStore((s) => s.deleteDraftsForProject);

    const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

    function handleDelete(projectId: string) {
        // Clean up all related data
        clearScenes(projectId);
        clearSchedule(projectId);
        deleteDrafts(projectId);
        deleteProject(projectId);
        setConfirmDeleteId(null);
    }

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
                        <div
                            key={project.id}
                            className="group relative p-5 bg-lemon-bg-secondary border border-lemon-gray-700 rounded-lg hover:border-lemon-cyan/40 hover:lemon-glow-cyan transition-all"
                        >
                            <Link
                                to={`/project/${project.id}`}
                                className="block"
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

                            {/* Delete button */}
                            {confirmDeleteId === project.id ? (
                                <div className="absolute top-3 right-3 flex items-center gap-2 bg-lemon-bg-primary border border-lemon-coral/50 rounded px-2 py-1 shadow-lg z-10">
                                    <span className="text-[0.6rem] text-lemon-coral font-mono">Delete?</span>
                                    <button
                                        onClick={(e) => { e.preventDefault(); handleDelete(project.id); }}
                                        className="text-[0.6rem] px-2 py-0.5 bg-lemon-coral text-white font-bold rounded hover:bg-lemon-coral/80 transition-colors"
                                    >
                                        YES
                                    </button>
                                    <button
                                        onClick={(e) => { e.preventDefault(); setConfirmDeleteId(null); }}
                                        className="text-[0.6rem] text-lemon-text-muted hover:text-lemon-text-primary transition-colors"
                                    >
                                        NO
                                    </button>
                                </div>
                            ) : (
                                <button
                                    onClick={(e) => { e.preventDefault(); setConfirmDeleteId(project.id); }}
                                    className="absolute top-3 right-3 text-lemon-gray-600 hover:text-lemon-coral transition-colors opacity-0 group-hover:opacity-100"
                                    title="Delete project"
                                >
                                    <Trash2 size={14} />
                                </button>
                            )}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
