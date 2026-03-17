import { useEffect, useRef, type ReactNode } from 'react';
import { useParams } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { useAuthStore } from '@/stores/auth-store';
import { loadProjectData } from '@/lib/firestore';
import { useState } from 'react';

interface ProjectLoaderProps {
    children: ReactNode;
}

/**
 * Wrap project routes with this component. It fires a parallel Firestore
 * load for all project data (scenes, breakdown, schedule, budgets) once
 * when the projectId changes, and shows a brief loading state.
 */
export function ProjectLoader({ children }: ProjectLoaderProps) {
    const { id: projectId } = useParams<{ id: string }>();
    const { user } = useAuthStore();
    const [isLoading, setIsLoading] = useState(false);
    const lastLoadedId = useRef<string | null>(null);

    useEffect(() => {
        if (!projectId || !user?.uid) return;
        if (lastLoadedId.current === projectId) return; // already loaded this project

        lastLoadedId.current = projectId;
        setIsLoading(true);
        loadProjectData(user.uid, projectId).finally(() => setIsLoading(false));
    }, [projectId, user?.uid]);

    if (isLoading) {
        return (
            <div className="flex h-full items-center justify-center">
                <Loader2 size={24} className="text-lemon-cyan animate-spin" />
            </div>
        );
    }

    return <>{children}</>;
}
