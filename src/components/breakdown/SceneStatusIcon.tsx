import { Check, AlertTriangle, Circle, XCircle } from 'lucide-react';

export type SceneStatus = 'reviewed' | 'done' | 'pending' | 'error';

export function SceneStatusIcon({ status }: { status: SceneStatus }) {
    switch (status) {
        case 'reviewed':
            return <Check size={14} className="text-lemon-cyan flex-shrink-0" />;
        case 'done':
            return <AlertTriangle size={14} className="text-lemon-yellow flex-shrink-0" />;
        case 'error':
            return <XCircle size={14} className="text-lemon-coral flex-shrink-0" />;
        case 'pending':
            return <Circle size={14} className="text-lemon-gray-600 flex-shrink-0" />;
    }
}
