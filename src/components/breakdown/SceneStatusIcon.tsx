/**
 * SceneStatusIcon.tsx — Scene status indicator with action activity ring overlay.
 *
 * Shows the base status (reviewed/done/pending/error) plus an animated ring
 * when an action is actively modifying this scene:
 *   - Running: spinning ring with red→orange color shift
 *   - Success: green pulse that fades after animation
 *   - Failed: red static ring
 */

import { Check, CheckCircle, Circle, XCircle } from 'lucide-react';
import { useActionActivityStore } from '@/stores/action-activity-store';

export type SceneStatus = 'reviewed' | 'done' | 'pending' | 'error';

// ── Animated SVG ring for action activity ──────────────────────────────

function ActivityRing({ activityStatus }: { activityStatus: 'running' | 'success' | 'failed' }) {
    if (activityStatus === 'running') {
        return (
            <span className="absolute inset-0 flex items-center justify-center">
                <svg width="20" height="20" viewBox="0 0 20 20" className="action-ring-spin">
                    <circle
                        cx="10" cy="10" r="8"
                        fill="none"
                        strokeWidth="2"
                        strokeDasharray="16 34"
                        strokeLinecap="round"
                        className="action-ring-color"
                    />
                </svg>
            </span>
        );
    }

    if (activityStatus === 'success') {
        return (
            <span className="absolute inset-0 flex items-center justify-center rounded-full action-success-glow">
                <svg width="16" height="16" viewBox="0 0 16 16">
                    <path
                        d="M4 8 L7 11 L12 5"
                        fill="none"
                        stroke="#22c55e"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        className="action-checkmark-draw"
                    />
                </svg>
            </span>
        );
    }

    if (activityStatus === 'failed') {
        return (
            <span className="absolute inset-0 flex items-center justify-center">
                <svg width="20" height="20" viewBox="0 0 20 20">
                    <circle
                        cx="10" cy="10" r="8"
                        fill="none"
                        stroke="#ef4444"
                        strokeWidth="2"
                        strokeDasharray="4 4"
                        opacity="0.8"
                    />
                </svg>
            </span>
        );
    }

    return null;
}

// ── Main component ─────────────────────────────────────────────────────

export function SceneStatusIcon({
    status,
    sceneNumber,
}: {
    status: SceneStatus;
    sceneNumber?: string;
}) {
    const activityStatus = useActionActivityStore(
        (s) => sceneNumber ? s.getSceneStatus(sceneNumber) : 'idle',
    );

    const baseIcon = (() => {
        switch (status) {
            case 'reviewed':
                return <Check size={14} className="text-lemon-cyan flex-shrink-0" />;
            case 'done':
                return <CheckCircle size={14} className="text-green-400 flex-shrink-0" />;
            case 'error':
                return <XCircle size={14} className="text-lemon-coral flex-shrink-0" />;
            case 'pending':
                return <Circle size={14} className="text-lemon-gray-600 flex-shrink-0" />;
        }
    })();

    if (activityStatus === 'idle') {
        return baseIcon;
    }

    return (
        <span className="relative inline-flex items-center justify-center w-5 h-5 flex-shrink-0">
            {baseIcon}
            <ActivityRing activityStatus={activityStatus} />
        </span>
    );
}
