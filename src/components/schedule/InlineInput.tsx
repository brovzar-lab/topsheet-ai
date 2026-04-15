/**
 * InlineInput — a small text input for inline editing within schedule strips.
 *
 * Focuses and selects all text on mount. Commits on Enter or blur; cancels on Escape.
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

    useEffect(() => {
        ref.current?.focus();
        ref.current?.select();
    }, []);

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') { e.preventDefault(); onCommit(val); }
        if (e.key === 'Escape') { e.preventDefault(); onCancel(); }
    };

    return (
        <input
            aria-label="Edit value"
            ref={ref}
            value={val}
            onChange={(e) => setVal(e.target.value)}
            onBlur={() => onCommit(val)}
            onKeyDown={handleKeyDown}
            className={`bg-transparent border-b border-current outline-none font-mono text-xs ${className ?? ''}`}
            onClick={(e) => e.stopPropagation()}
        />
    );
}
