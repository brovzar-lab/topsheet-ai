import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
    children: ReactNode;
    fallback?: ReactNode;
}

interface State {
    hasError: boolean;
    error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
    state: State = { hasError: false, error: null };

    static getDerivedStateFromError(error: Error): State {
        return { hasError: true, error };
    }

    componentDidCatch(error: Error, info: ErrorInfo) {
        console.error('[ErrorBoundary]', error, info.componentStack);
    }

    render() {
        if (this.state.hasError) {
            if (this.props.fallback) return this.props.fallback;
            return (
                <div className="flex flex-col items-center justify-center h-full gap-4 p-8">
                    <p className="font-display font-black text-lemon-coral text-sm uppercase tracking-wider">
                        Something went wrong
                    </p>
                    <p className="font-mono text-xs text-lemon-text-muted text-center max-w-sm">
                        {this.state.error?.message ?? 'An unexpected error occurred.'}
                    </p>
                    <button
                        onClick={() => this.setState({ hasError: false, error: null })}
                        className="px-4 py-2 bg-lemon-cyan text-lemon-black font-mono text-xs font-bold rounded
                            hover:bg-lemon-cyan-dim transition-colors uppercase tracking-wider"
                    >
                        Try Again
                    </button>
                </div>
            );
        }
        return this.props.children;
    }
}
