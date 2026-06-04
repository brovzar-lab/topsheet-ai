/**
 * InlineInput — a small text input for inline editing within schedule strips.
 *
 * Focuses and selects all text on mount. Commits on Enter or blur; cancels on Escape.
 *
 * Bug fix: Escape sets a cancelled ref before calling onCancel() so the
 * subsequent blur event doesn't overwrite it with onCommit(val).
 */

import { useEffect, useRef, useState } from 'react';

export function InlineInput({
    value,
    onCommit,
    onCancel,
    className,
}: {
    value: string;
    onCommit: (val: string) => void;
    onCancel: () => void;
    className?: string;
}) {
    const ref = useRef<HTMLInputElement>(null);
    const [val, setVal] = useState(value);
    // Guard: Escape sets this flag BEFORE the input loses focus,
    // so the blur handler doesn't fire onCommit after a cancel.
    const cancelled = useRef(false);

    useEffect(() => {
        ref.current?.focus();
        ref.current?.select();
    }, []);

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') { e.preventDefault(); onCommit(val); }
        if (e.key === 'Escape') {
            e.preventDefault();
            cancelled.current = true;
            onCancel();
        }
    };

    return (
        <input
            aria-label="Edit value"
            ref={ref}
            value={val}
            onChange={(e) => setVal(e.target.value)}
            onBlur={() => { if (!cancelled.current) onCommit(val); }}
            onKeyDown={handleKeyDown}
            className={`bg-transparent border-b border-current outline-none font-mono text-xs ${className ?? ''}`}
            onClick={(e) => e.stopPropagation()}
        />
    );
}
