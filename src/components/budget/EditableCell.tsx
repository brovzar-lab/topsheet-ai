/**
 * EditableCell — inline editing for numeric budget fields.
 *
 * Double-click to enter edit mode; Enter or blur to commit; Escape to cancel.
 */

import { useState, useEffect, useRef } from 'react';

export function EditableCell({
    value,
    onCommit,
    format,
    integer,
}: {
    value: number;
    onCommit: (v: number) => void;
    format?: (v: number) => string;
    integer?: boolean;
}) {
    const [editing, setEditing] = useState(false);
    const [draft, setDraft] = useState(String(value));
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (editing && inputRef.current) {
            inputRef.current.focus();
            inputRef.current.select();
        }
    }, [editing]);

    const commitValue = () => {
        const parsed = integer ? parseInt(draft, 10) : parseFloat(draft);
        if (!isNaN(parsed) && parsed !== value) {
            onCommit(parsed);
        }
        setEditing(false);
    };

    if (editing) {
        return (
            <input
                aria-label="Edit budget value"
                ref={inputRef}
                type="number"
                step={integer ? '1' : '0.01'}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onBlur={commitValue}
                onKeyDown={(e) => {
                    if (e.key === 'Enter') commitValue();
                    if (e.key === 'Escape') setEditing(false);
                }}
                className="w-full bg-lemon-bg-tertiary border border-lemon-cyan/50 rounded px-1.5 py-0.5 text-right font-mono text-sm text-lemon-text-primary focus:outline-none focus:border-lemon-cyan"
            />
        );
    }

    return (
        <span
            onDoubleClick={() => {
                setDraft(String(value));
                setEditing(true);
            }}
            className="cursor-pointer hover:text-lemon-cyan hover:underline hover:underline-offset-2 transition-colors"
            title="Double-click to edit"
        >
            {format ? format(value) : String(value)}
        </span>
    );
}
