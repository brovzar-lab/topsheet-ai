import { useParams } from 'react-router-dom';

export function ProjectPage() {
    const { id } = useParams();

    return (
        <div className="p-8 max-w-5xl mx-auto">
            <span className="lemon-label block mb-2">PROJECT</span>
            <h1 className="mb-2">Script Overview</h1>
            <p className="text-lemon-text-muted font-body text-sm mb-8">
                Project ID: {id}
            </p>

            <div className="border border-lemon-gray-700 rounded-lg p-12 text-center bg-lemon-bg-secondary/30">
                <h3 className="text-lemon-text-body mb-2">Phase 2 — Script Viewer</h3>
                <p className="text-lemon-text-muted text-sm">
                    Parsed script text with scene list will appear here.
                </p>
            </div>
        </div>
    );
}
