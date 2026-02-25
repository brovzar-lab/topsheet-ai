/**
 * ProjectPage.tsx — Script Viewer with inline element tagging.
 *
 * Shows the parsed script text with breakdown elements highlighted inline.
 * Elements are color-coded by category. Click a highlighted word to see its details.
 */

import { useMemo, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { FileText, Tag, Eye, EyeOff } from 'lucide-react';
import { useProjectStore } from '@/stores/project-store';
import { useSceneStore } from '@/stores/scene-store';
import { useBreakdownStore } from '@/stores/breakdown-store';
import { getCategoryById } from '@/data/element-categories';

export function ProjectPage() {
    const { id: projectId } = useParams<{ id: string }>();
    const project = useProjectStore((s) => s.getProject(projectId ?? ''));
    const scenes = useSceneStore((s) => s.getScenes(projectId ?? ''));
    const breakdowns = useBreakdownStore((s) => s.breakdowns);

    const [selectedScene, setSelectedScene] = useState<string | null>(scenes[0]?.sceneNumber ?? null);
    const [showTags, setShowTags] = useState(true);

    if (!projectId || !project) {
        return (
            <div className="p-8 max-w-5xl mx-auto">
                <span className="lemon-label block mb-2">PROJECT</span>
                <h1 className="mb-2">Script Overview</h1>
                <p className="text-lemon-text-muted font-body text-sm">
                    No project found.
                </p>
            </div>
        );
    }

    if (scenes.length === 0) {
        return (
            <div className="p-8 max-w-5xl mx-auto">
                <span className="lemon-label block mb-2">PROJECT · SCRIPT</span>
                <h1 className="mb-4">{project.title}</h1>
                <div className="border border-lemon-gray-700 rounded-lg p-12 text-center bg-lemon-bg-secondary/30">
                    <FileText size={48} className="mx-auto mb-4 text-lemon-gray-500" />
                    <h3 className="text-lemon-text-body mb-2">No Scenes Parsed</h3>
                    <p className="text-lemon-text-muted text-sm mb-4">Upload a screenplay PDF to get started.</p>
                    <Link
                        to="/project/new"
                        className="inline-flex items-center gap-2 px-4 py-2 bg-lemon-cyan text-lemon-black font-display font-bold uppercase text-sm rounded hover:bg-lemon-cyan-dim transition-colors"
                    >
                        Upload Screenplay
                    </Link>
                </div>
            </div>
        );
    }

    const currentScene = scenes.find((s) => s.sceneNumber === selectedScene);
    const currentBreakdown = selectedScene ? breakdowns[selectedScene] : undefined;

    return (
        <div className="flex h-full">
            {/* ── Scene List ── */}
            <aside className="w-56 border-r border-lemon-gray-700 bg-lemon-bg-secondary/50 overflow-y-auto flex-shrink-0">
                <div className="p-3 border-b border-lemon-gray-700">
                    <span className="lemon-label block mb-0.5">SCRIPT</span>
                    <p className="text-[0.6rem] text-lemon-text-muted">{scenes.length} scenes · {project.pdfFilename}</p>
                </div>
                <div className="py-1">
                    {scenes.map((scene) => (
                        <button
                            key={scene.sceneNumber}
                            onClick={() => setSelectedScene(scene.sceneNumber)}
                            className={`w-full text-left px-3 py-2 text-xs transition-colors ${scene.sceneNumber === selectedScene
                                ? 'bg-lemon-bg-primary border-l-2 border-lemon-cyan text-lemon-text-primary'
                                : 'border-l-2 border-transparent text-lemon-text-body hover:bg-lemon-bg-primary/50'
                                }`}
                        >
                            <span className="font-mono text-[0.6rem] text-lemon-text-muted">
                                {scene.sceneNumber}
                            </span>
                            <p className="truncate">{scene.slugline.location || scene.slugline.raw}</p>
                        </button>
                    ))}
                </div>
            </aside>

            {/* ── Script Content ── */}
            <div className="flex-1 overflow-y-auto p-6">
                <div className="flex items-center justify-between mb-4">
                    <div>
                        <span className="lemon-label block mb-1">PROJECT · SCRIPT</span>
                        <h1 className="text-lg">{project.title}</h1>
                    </div>
                    <button
                        onClick={() => setShowTags(!showTags)}
                        className={`flex items-center gap-1.5 px-3 py-1.5 border rounded text-xs font-mono transition-colors ${showTags
                            ? 'border-lemon-cyan text-lemon-cyan bg-lemon-cyan/10'
                            : 'border-lemon-gray-600 text-lemon-text-muted hover:border-lemon-gray-500'
                            }`}
                    >
                        {showTags ? <Eye size={12} /> : <EyeOff size={12} />}
                        {showTags ? 'Tags On' : 'Tags Off'}
                    </button>
                </div>

                {currentScene && (
                    <div className="mb-6">
                        {/* Scene header */}
                        <div className="px-4 py-3 bg-lemon-bg-secondary border border-lemon-gray-700 rounded-t-lg">
                            <div className="flex items-center gap-2">
                                <Tag size={14} className="text-lemon-cyan" />
                                <span className="font-display font-bold text-sm text-lemon-text-primary">
                                    Scene {currentScene.sceneNumber}
                                </span>
                                <span className="font-mono text-[0.6rem] text-lemon-text-muted">
                                    {currentScene.slugline.intExt} · {currentScene.slugline.location} · {currentScene.slugline.timeOfDay}
                                </span>
                                <span className="ml-auto font-mono text-[0.6rem] text-lemon-yellow">
                                    {currentScene.pageCount}/8 pg
                                </span>
                            </div>
                        </div>

                        {/* Script text with inline tags */}
                        <div className="px-4 py-4 bg-lemon-bg-primary border-x border-b border-lemon-gray-700 rounded-b-lg">
                            <TaggedScriptText
                                content={currentScene.content}
                                elements={currentBreakdown?.elements.map((e) => e.name) ?? []}
                                elementDetails={currentBreakdown?.elements ?? []}
                                showTags={showTags}
                            />
                        </div>

                        {/* Element summary strip */}
                        {currentBreakdown && currentBreakdown.elements.length > 0 && (
                            <div className="mt-3 flex flex-wrap gap-1.5">
                                {currentBreakdown.elements.map((el) => {
                                    const cat = getCategoryById(el.categoryId);
                                    return (
                                        <span
                                            key={el.id}
                                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[0.55rem] font-mono border"
                                            style={{
                                                borderColor: (cat?.color ?? '#666') + '50',
                                                backgroundColor: (cat?.color ?? '#666') + '15',
                                                color: cat?.color ?? '#888',
                                            }}
                                        >
                                            <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: cat?.color ?? '#666' }} />
                                            {el.name}
                                        </span>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}

// -----------------------------------------------------------------------
// Tagged Script Text — highlights element names in the script content
// -----------------------------------------------------------------------

function TaggedScriptText({
    content,
    elements,
    elementDetails,
    showTags,
}: {
    content: string;
    elements: string[];
    elementDetails: import('@/types').BreakdownElement[];
    showTags: boolean;
}) {
    const highlighted = useMemo(() => {
        if (!showTags || elements.length === 0) {
            return [{ text: content, isTag: false, color: '' }];
        }

        // Build regex from element names (escape special chars, sort by length desc for greedy match)
        const sorted = [...elements]
            .filter((e) => e.length >= 2)
            .sort((a, b) => b.length - a.length);

        if (sorted.length === 0) return [{ text: content, isTag: false, color: '' }];

        const escaped = sorted.map((e) => e.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
        const regex = new RegExp(`(${escaped.join('|')})`, 'gi');

        const parts: { text: string; isTag: boolean; color: string }[] = [];
        let lastIdx = 0;
        let match: RegExpExecArray | null;
        while ((match = regex.exec(content)) !== null) {
            if (match.index > lastIdx) {
                parts.push({ text: content.slice(lastIdx, match.index), isTag: false, color: '' });
            }
            // Find the matching element detail for color
            const matchedName = match[1]!;
            const detail = elementDetails.find((d) => d.name.toLowerCase() === matchedName.toLowerCase());
            const cat = detail ? getCategoryById(detail.categoryId) : undefined;
            parts.push({
                text: match[0],
                isTag: true,
                color: cat?.color ?? '#FFFF00',
            });
            lastIdx = match.index + match[0].length;
        }
        if (lastIdx < content.length) {
            parts.push({ text: content.slice(lastIdx), isTag: false, color: '' });
        }
        return parts;
    }, [content, elements, elementDetails, showTags]);

    return (
        <pre className="whitespace-pre-wrap font-mono text-xs text-lemon-text-body leading-relaxed">
            {highlighted.map((part, i) =>
                part.isTag ? (
                    <mark
                        key={i}
                        className="rounded px-0.5 py-px font-bold cursor-default"
                        style={{
                            backgroundColor: part.color + '25',
                            color: part.color,
                            borderBottom: `1px solid ${part.color}50`,
                        }}
                        title={part.text}
                    >
                        {part.text}
                    </mark>
                ) : (
                    <span key={i}>{part.text}</span>
                ),
            )}
        </pre>
    );
}
