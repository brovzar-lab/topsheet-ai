/**
 * Recursively strip `undefined` values from an object tree.
 *
 * Firestore rejects documents that contain `undefined` field values.
 * Optional TypeScript fields (e.g. `synopsis?: string`) default to
 * `undefined` at runtime. This helper deep-cleans objects before they
 * reach `setDoc`.
 *
 * - Arrays are preserved (elements are cleaned recursively).
 * - Non-plain values (Date, Timestamp, etc.) pass through untouched.
 * - `null` is kept — Firestore accepts it (maps to "delete field").
 */
export function stripUndefined<T>(obj: T): T {
    if (obj === null || obj === undefined) return obj;
    if (typeof obj !== 'object') return obj;

    if (Array.isArray(obj)) {
        return obj.map((item) => stripUndefined(item)) as unknown as T;
    }

    // Only clean plain objects — leave Dates, Timestamps, etc. alone
    const proto = Object.getPrototypeOf(obj);
    if (proto !== Object.prototype && proto !== null) return obj;

    const cleaned: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
        if (value !== undefined) {
            cleaned[key] = stripUndefined(value);
        }
    }
    return cleaned as T;
}
