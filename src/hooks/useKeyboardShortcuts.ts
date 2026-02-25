/**
 * useKeyboardShortcuts.ts — Global keyboard shortcuts for power-user navigation.
 *
 * Shortcuts:
 * - ⌘S / Ctrl+S → Save (prevent browser save)
 * - ⌘1-7 → Jump to project pages (Script/Breakdown/Schedule/etc.)
 * - ⌘D → Dashboard
 */

import { useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';

const PROJECT_PAGES = [
    '', // Script (project root)
    '/breakdown',
    '/schedule',
    '/budget',
    '/doods',
    '/elements',
    '/calendar',
] as const;

export function useKeyboardShortcuts(projectId?: string) {
    const navigate = useNavigate();

    const handleKeyDown = useCallback((e: KeyboardEvent) => {
        const meta = e.metaKey || e.ctrlKey;
        const target = e.target as HTMLElement;

        // Don't hijack input fields (except Escape)
        if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT') {
            if (e.key !== 'Escape') return;
        }

        // ⌘S / Ctrl+S — Prevent browser save dialog
        if (meta && e.key === 's') {
            e.preventDefault();
            return;
        }

        // ⌘1-7 — Jump to project pages
        if (meta && projectId && e.key >= '1' && e.key <= '7') {
            e.preventDefault();
            const idx = parseInt(e.key) - 1;
            const suffix = PROJECT_PAGES[idx];
            if (suffix !== undefined) {
                navigate(`/project/${projectId}${suffix}`);
            }
            return;
        }

        // ⌘D — Go to dashboard
        if (meta && e.key === 'd') {
            e.preventDefault();
            navigate('/');
            return;
        }
    }, [projectId, navigate]);

    useEffect(() => {
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [handleKeyDown]);
}
