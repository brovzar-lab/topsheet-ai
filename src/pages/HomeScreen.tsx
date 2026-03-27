import { useNavigate } from 'react-router-dom';

export function HomeScreen() {
    const navigate = useNavigate();

    return (
        <div className="p-8 max-w-3xl mx-auto">
            <h1 className="mb-2">New Project</h1>
            <p className="text-lemon-text-muted font-body text-sm mb-8">
                Choose a format to get started. Each format has its own breakdown, schedule, and budget workflow.
            </p>

            <div className="grid grid-cols-2 gap-4">
                {/* Feature Film */}
                <button
                    data-testid="format-film"
                    onClick={() => navigate('/project/new')}
                    className="text-left p-6 bg-lemon-bg-secondary border border-lemon-gray-700 rounded-xl hover:border-lemon-cyan/40 transition-colors"
                >
                    <span className="text-3xl mb-3 block">🎬</span>
                    <p className="font-mono text-[0.6rem] tracking-widest uppercase text-lemon-cyan mb-1">
                        Single Production
                    </p>
                    <h2 className="text-lemon-text-primary mb-2">Feature Film</h2>
                    <p className="text-lemon-text-muted text-sm leading-relaxed">
                        One screenplay. Full breakdown, schedule, and budget in a single project.
                    </p>
                    <div className="flex flex-wrap gap-2 mt-4">
                        {['1 Screenplay', '1 Budget', '1 Schedule'].map(t => (
                            <span key={t} className="font-mono text-[0.58rem] tracking-wide uppercase px-2 py-0.5 border border-lemon-gray-700 rounded text-lemon-text-muted">
                                {t}
                            </span>
                        ))}
                    </div>
                </button>

                {/* TV Series */}
                <button
                    data-testid="format-tv"
                    onClick={() => navigate('/series/new')}
                    className="text-left p-6 bg-lemon-bg-secondary border border-lemon-gray-700 rounded-xl hover:border-lemon-cyan/40 transition-colors"
                >
                    <span className="text-3xl mb-3 block">📺</span>
                    <p className="font-mono text-[0.6rem] tracking-widest uppercase text-lemon-cyan mb-1">
                        Multi-Episode
                    </p>
                    <h2 className="text-lemon-text-primary mb-2">TV Series</h2>
                    <p className="text-lemon-text-muted text-sm leading-relaxed">
                        Define your series first, then upload each episode screenplay into its own compartment.
                    </p>
                    <div className="flex flex-wrap gap-2 mt-4">
                        {['N Episodes', 'Series Budget', 'Master Schedule'].map(t => (
                            <span key={t} className="font-mono text-[0.58rem] tracking-wide uppercase px-2 py-0.5 border border-lemon-gray-700 rounded text-lemon-text-muted">
                                {t}
                            </span>
                        ))}
                    </div>
                </button>
            </div>
        </div>
    );
}
