import { useState } from 'react';
import { RotateCcw, AlertTriangle, CheckCircle, Trash2 } from 'lucide-react';
import { useAuthStore } from '@/stores/auth-store';
import { useProjectStore } from '@/stores/project-store';
import { useSceneStore } from '@/stores/scene-store';
import { useBreakdownStore } from '@/stores/breakdown-store';
import { useScheduleStore } from '@/stores/schedule-store';
import { useBudgetStore } from '@/stores/budget-store';
import { useMPIStore } from '@/stores/mpi-store';

export function ResetDataPanel() {
    const user = useAuthStore(s => s.user);
    const clearProjects = useProjectStore((s) => s.clearAll);
    const clearBreakdowns = useBreakdownStore((s) => s.clearAll);
    const clearSchedules = useScheduleStore((s) => s.clearAll);
    const clearBudgets = useBudgetStore((s) => s.clearAll);
    const clearMPI = useMPIStore((s) => s.clearRecords);
    const projectCount = useProjectStore((s) => s.projects.length);

    const [step, setStep] = useState<'idle' | 'confirm' | 'done'>('idle');

    function handleReset() {
        clearProjects();
        clearBreakdowns();
        clearSchedules();
        clearBudgets();
        if (user?.uid) clearMPI(user.uid);
        // Wipe entire scenes object
        useSceneStore.setState({ scenes: {} });
        setStep('done');
        setTimeout(() => setStep('idle'), 2000);
    }

    return (
        <div className="p-6 bg-lemon-bg-secondary border border-lemon-coral/30 rounded-lg">
            <div className="flex items-center gap-2 mb-1">
                <RotateCcw size={16} className="text-lemon-coral" />
                <h3 className="text-lemon-text-primary">Reset All Data</h3>
            </div>
            <p className="text-xs text-lemon-text-muted mb-4">
                Permanently delete all projects, breakdowns, schedules, budgets, and MPI learning data.
                This cannot be undone.
            </p>

            {step === 'done' ? (
                <div className="flex items-center gap-2 text-lemon-cyan text-sm animate-pulse">
                    <CheckCircle size={14} />
                    <span>All data cleared</span>
                </div>
            ) : step === 'confirm' ? (
                <div className="flex items-center gap-3">
                    <AlertTriangle size={14} className="text-lemon-coral" />
                    <span className="text-xs text-lemon-coral">
                        Delete {projectCount} project{projectCount !== 1 ? 's' : ''} and ALL associated data?
                    </span>
                    <button
                        onClick={handleReset}
                        className="text-xs px-3 py-1.5 bg-lemon-coral text-white font-display font-bold uppercase rounded hover:bg-lemon-coral/80 transition-colors"
                    >
                        Yes, Delete Everything
                    </button>
                    <button
                        onClick={() => setStep('idle')}
                        className="text-xs text-lemon-text-muted hover:text-lemon-text-primary transition-colors"
                    >
                        Cancel
                    </button>
                </div>
            ) : (
                <button
                    onClick={() => setStep('confirm')}
                    className="flex items-center gap-2 text-xs text-lemon-gray-400 hover:text-lemon-coral transition-colors"
                >
                    <Trash2 size={12} />
                    Reset all data
                </button>
            )}
        </div>
    );
}
