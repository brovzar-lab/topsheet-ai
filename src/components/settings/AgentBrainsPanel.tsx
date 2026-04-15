import { useState, useRef } from 'react';
import { Brain, Upload, Trash2, Lock, RotateCcw } from 'lucide-react';
import { useAgentBrainStore } from '@/stores/agent-brain-store';
import type { SkillFile } from '@/stores/agent-brain-store';
import JSZip from 'jszip';

const AGENT_CONFIG = [
    {
        key: 'rafa' as const,
        name: 'Rafa',
        role: '1st Assistant Director',
        accentClass: 'text-lemon-yellow',
        borderClass: 'border-lemon-yellow/30',
        bgClass: 'bg-lemon-yellow/5',
        badgeClass: 'bg-lemon-yellow/15 text-lemon-yellow',
        dropBorderActive: 'border-lemon-yellow',
        owned: ['Breakdown', 'Schedule', 'Elements', 'Calendar'],
    },
    {
        key: 'sandra' as const,
        name: 'Sandra',
        role: 'Line Producer',
        accentClass: 'text-lemon-cyan',
        borderClass: 'border-lemon-cyan/30',
        bgClass: 'bg-lemon-cyan/5',
        badgeClass: 'bg-lemon-cyan/15 text-lemon-cyan',
        dropBorderActive: 'border-lemon-cyan',
        owned: ['Budget', 'DOODs', 'Roster', 'Episode Budget'],
    },
] as const;

type AgentConfig = (typeof AGENT_CONFIG)[number];

function AgentBrainCard({ agent }: { agent: AgentConfig }) {
    const { addSkill, removeSkill, replaceV1, restoreV1, getAllSkills } = useAgentBrainStore();
    const v1Replaced = useAgentBrainStore((s) => agent.key === 'rafa' ? s.rafaV1Replaced : s.sandraV1Replaced);
    const skills = getAllSkills(agent.key);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [dragging, setDragging] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
    const [pendingFile, setPendingFile] = useState<{name: string; content: string; size: number} | null>(null);

    async function readFile(file: File) {
        const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
        const isArchive = ext === 'skill' || ext === 'zip';
        const isPlainText = ext === 'md' || ext === 'txt';

        if (!isArchive && !isPlainText) {
            alert('Accepted formats: .skill, .zip, .md, .txt');
            return;
        }

        setUploading(true);
        try {
            let content = '';
            let displayName = file.name;

            if (isArchive) {
                const zip = await JSZip.loadAsync(await file.arrayBuffer());
                const skillMdFile = Object.entries(zip.files).find(
                    ([path, f]) => !f.dir && /(?:^|\/)??SKILL\.md$/i.test(path)
                );
                if (!skillMdFile) {
                    alert('No SKILL.md found in this archive.');
                    return;
                }
                const skillMdContent = await skillMdFile[1].async('string');
                content += skillMdContent;
                const nameMatch = skillMdContent.match(/^name:\s*(.+)$/m);
                if (nameMatch?.[1]) displayName = `${nameMatch[1].trim()}.skill`;
                const refBasePath = skillMdFile[0].replace(/SKILL\.md$/i, 'references/');
                const refFiles = Object.entries(zip.files)
                    .filter(([path, f]) => !f.dir && path.startsWith(refBasePath) && /\.md$/i.test(path))
                    .sort(([a], [b]) => a.localeCompare(b));
                for (const [refPath, refFile] of refFiles) {
                    const refName = refPath.split('/').pop() ?? refPath;
                    const refContent = await refFile.async('string');
                    content += `\n\n---\n### Reference: ${refName}\n${refContent}`;
                }
            } else {
                content = await file.text();
            }

            // If V1 is still active, ask merge vs replace
            if (!v1Replaced) {
                setPendingFile({ name: displayName, content, size: file.size });
            } else {
                // V1 already replaced — just add
                const skill: SkillFile = {
                    id: crypto.randomUUID(),
                    name: displayName,
                    content,
                    uploadedAt: new Date().toISOString(),
                    sizeBytes: file.size,
                };
                addSkill(agent.key, skill);
            }
        } finally {
            setUploading(false);
        }
    }

    function handleMerge() {
        if (!pendingFile) return;
        const skill: SkillFile = {
            id: crypto.randomUUID(),
            name: pendingFile.name,
            content: pendingFile.content,
            uploadedAt: new Date().toISOString(),
            sizeBytes: pendingFile.size,
        };
        addSkill(agent.key, skill);
        setPendingFile(null);
    }

    function handleReplace() {
        if (!pendingFile) return;
        replaceV1(agent.key);
        const skill: SkillFile = {
            id: crypto.randomUUID(),
            name: pendingFile.name,
            content: pendingFile.content,
            uploadedAt: new Date().toISOString(),
            sizeBytes: pendingFile.size,
        };
        addSkill(agent.key, skill);
        setPendingFile(null);
    }

    function onDrop(e: React.DragEvent) {
        e.preventDefault();
        setDragging(false);
        const file = e.dataTransfer.files[0];
        if (file) readFile(file);
    }

    function onInputChange(e: React.ChangeEvent<HTMLInputElement>) {
        const file = e.target.files?.[0];
        if (file) readFile(file);
        e.target.value = '';
    }

    return (
        <div className={`p-5 rounded-lg border bg-lemon-bg-secondary ${agent.borderClass}`}>
            {/* Header */}
            <div className="flex items-center justify-between mb-1">
                <div>
                    <p className={`text-sm font-display font-bold uppercase tracking-wide ${agent.accentClass}`}>
                        {agent.name}
                    </p>
                    <p className="text-xs text-lemon-text-muted">{agent.role}</p>
                </div>
                <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full ${agent.bgClass} border ${agent.borderClass}`}>
                    <Brain size={11} className={agent.accentClass} />
                    <span className={`text-xs font-mono ${agent.accentClass}`}>
                        {skills.length} skill{skills.length !== 1 ? 's' : ''}
                    </span>
                </div>
            </div>

            {/* Owned sections */}
            <div className="flex flex-wrap gap-1 mt-2 mb-4">
                {agent.owned.map((section) => (
                    <span
                        key={section}
                        className={`text-[10px] px-2 py-0.5 rounded-full font-mono ${agent.badgeClass}`}
                    >
                        {section}
                    </span>
                ))}
            </div>

            {/* Skills list */}
            {skills.length > 0 && (
                <div className="space-y-1.5 mb-3">
                    {skills.map((skill) => (
                        <div
                            key={skill.id}
                            className={`flex items-center justify-between gap-2 px-3 py-2 rounded border ${
                                skill.builtIn
                                    ? 'bg-lemon-bg-tertiary/60 border-lemon-gray-600'
                                    : 'bg-lemon-bg-tertiary border-lemon-gray-700'
                            }`}
                        >
                            <div className="min-w-0 flex items-center gap-2">
                                {skill.builtIn && (
                                    <Lock size={10} className="text-lemon-gray-500 flex-shrink-0" />
                                )}
                                <div className="min-w-0">
                                    <p className="text-xs text-lemon-text-primary font-mono truncate">
                                        {skill.name}
                                        {skill.builtIn && (
                                            <span className="ml-1.5 text-[9px] text-lemon-gray-500 font-display uppercase">
                                                built-in
                                            </span>
                                        )}
                                    </p>
                                    <p className="text-[10px] text-lemon-text-muted">
                                        {Math.round(skill.sizeBytes / 1024 * 10) / 10} KB ·{' '}
                                        {skill.builtIn
                                            ? 'Hardcoded'
                                            : new Date(skill.uploadedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
                                        }
                                    </p>
                                </div>
                            </div>
                            {!skill.builtIn && (
                                confirmDelete === skill.id ? (
                                    <div className="flex items-center gap-2 flex-shrink-0">
                                        <button
                                            onClick={() => { removeSkill(agent.key, skill.id); setConfirmDelete(null); }}
                                            className="text-[10px] px-2 py-1 bg-lemon-coral text-white rounded font-display font-bold uppercase hover:bg-lemon-coral/80 transition-colors"
                                        >
                                            Remove
                                        </button>
                                        <button
                                            onClick={() => setConfirmDelete(null)}
                                            className="text-[10px] text-lemon-text-muted hover:text-lemon-text-primary transition-colors"
                                        >
                                            Cancel
                                        </button>
                                    </div>
                                ) : (
                                    <button
                                        onClick={() => setConfirmDelete(skill.id)}
                                        className="flex-shrink-0 text-lemon-gray-500 hover:text-lemon-coral transition-colors"
                                        title="Remove skill"
                                    >
                                        <Trash2 size={12} />
                                    </button>
                                )
                            )}
                        </div>
                    ))}
                </div>
            )}

            {/* Restore V1 button (if replaced) */}
            {v1Replaced && (
                <button
                    onClick={() => restoreV1(agent.key)}
                    className="flex items-center gap-1.5 mb-3 px-3 py-1.5 rounded text-[10px] font-display font-bold uppercase text-lemon-text-muted border border-lemon-gray-600 hover:border-lemon-gray-500 hover:text-lemon-text-primary transition-colors"
                >
                    <RotateCcw size={10} />
                    Restore built-in V1
                </button>
            )}

            {/* Merge vs Replace dialog */}
            {pendingFile && (
                <div className="mb-3 p-3 rounded border border-lemon-yellow/40 bg-lemon-yellow/5">
                    <p className="text-xs text-lemon-text-primary font-display font-bold mb-1">
                        Uploading: {pendingFile.name}
                    </p>
                    <p className="text-[10px] text-lemon-text-muted mb-3">
                        This agent has a built-in V1 skill. How would you like to handle the upload?
                    </p>
                    <div className="flex gap-2">
                        <button
                            onClick={handleMerge}
                            className="flex-1 text-[10px] px-3 py-1.5 rounded font-display font-bold uppercase bg-lemon-cyan/20 text-lemon-cyan border border-lemon-cyan/30 hover:bg-lemon-cyan/30 transition-colors"
                        >
                            Merge — keep V1 + add this
                        </button>
                        <button
                            onClick={handleReplace}
                            className="flex-1 text-[10px] px-3 py-1.5 rounded font-display font-bold uppercase bg-lemon-coral/20 text-lemon-coral border border-lemon-coral/30 hover:bg-lemon-coral/30 transition-colors"
                        >
                            Replace V1 with this
                        </button>
                    </div>
                    <button
                        onClick={() => setPendingFile(null)}
                        className="mt-2 text-[10px] text-lemon-text-muted hover:text-lemon-text-primary transition-colors"
                    >
                        Cancel
                    </button>
                </div>
            )}

            {/* Drop zone */}
            <div
                onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
                onDragLeave={() => setDragging(false)}
                onDrop={onDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`relative border-2 border-dashed rounded-lg p-5 text-center cursor-pointer transition-colors
                    ${dragging
                        ? `${agent.dropBorderActive} ${agent.bgClass}`
                        : 'border-lemon-gray-600 hover:border-lemon-gray-500'
                    } ${uploading ? 'pointer-events-none opacity-50' : ''}`}
            >
                <input
                    aria-label="Upload skill file"
                    ref={fileInputRef}
                    type="file"
                    accept=".md,.txt"
                    onChange={onInputChange}
                    className="hidden"
                />
                <Upload size={20} className={`mx-auto mb-2 ${dragging ? agent.accentClass : 'text-lemon-gray-500'}`} />
                {uploading ? (
                    <p className="text-xs text-lemon-text-muted animate-pulse">Reading skill file…</p>
                ) : (
                    <>
                        <p className="text-xs font-display font-bold uppercase text-lemon-text-muted">
                            Drop a skill file
                        </p>
                        <p className="text-[10px] text-lemon-gray-600 mt-0.5">.skill · .zip · .md · .txt</p>
                    </>
                )}
            </div>
        </div>
    );
}

export function AgentBrainsPanel() {
    return (
        <div className="space-y-3">
            <div className="flex items-center gap-2">
                <Brain size={16} className="text-lemon-text-muted" />
                <h3 className="text-lemon-text-primary">Agent Brains</h3>
            </div>
            <p className="text-xs text-lemon-text-muted">
                Upload skill files (.md or .txt) to upgrade each agent's expertise.
                Skills are injected into every AI call that agent makes — improving
                breakdown quality, budget analysis, scheduling decisions, and brainstorm sessions.
            </p>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                {AGENT_CONFIG.map((agent) => (
                    <AgentBrainCard key={agent.key} agent={agent} />
                ))}
            </div>
        </div>
    );
}
