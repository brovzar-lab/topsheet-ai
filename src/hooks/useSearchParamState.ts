/**
 * useSearchParamState — useState that syncs to URL search params.
 *
 * Drop-in replacement for useState that reads the initial value from the URL
 * and writes changes back. On refresh, the URL restores the last-selected value.
 *
 * Uses `replace` navigation to avoid polluting browser history.
 * Preserves existing search params (e.g. ?seriesId=... stays intact).
 */

import { useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';

/**
 * Sync a single URL search param with component state.
 *
 * @param key     The query-param name (e.g. 'scene', 'day', 'draft')
 * @param fallback Default value when the param is absent from the URL
 * @param type    'string' (default) or 'number' — controls parsing
 *
 * @example
 * const [scene, setScene] = useSearchParamState('scene', scenes[0]?.sceneNumber ?? null);
 * const [day, setDay]     = useSearchParamState('day', null, 'number');
 */
export function useSearchParamState(
    key: string,
    fallback: string | null,
    type?: 'string',
): [string | null, (value: string | null) => void];

export function useSearchParamState(
    key: string,
    fallback: number | null,
    type: 'number',
): [number | null, (value: number | null) => void];

export function useSearchParamState(
    key: string,
    fallback: string | number | null,
    type?: 'string' | 'number',
) {
    const [searchParams, setSearchParams] = useSearchParams();

    // Read current value from URL, falling back to the provided default
    const raw = searchParams.get(key);
    let current: string | number | null;

    if (raw === null) {
        current = fallback;
    } else if (type === 'number') {
        const parsed = parseInt(raw, 10);
        current = isNaN(parsed) ? fallback : parsed;
    } else {
        current = raw;
    }

    // Setter: update the URL param (replace, not push)
    const setValue = useCallback(
        (value: string | number | null) => {
            setSearchParams(
                (prev) => {
                    const next = new URLSearchParams(prev);
                    if (value === null || value === undefined) {
                        next.delete(key);
                    } else {
                        next.set(key, String(value));
                    }
                    return next;
                },
                { replace: true },
            );
        },
        [key, setSearchParams],
    );

    return [current, setValue] as const;
}
