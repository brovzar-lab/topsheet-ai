/**
 * Tiny module that provides the current Firebase UID without importing any store.
 * All stores import from here to avoid circular dependencies.
 *
 * This replaces the fragile `require('@/stores/auth-store')` pattern.
 */

let _currentUid: string | null = null;

export function setCurrentUid(uid: string | null): void {
    _currentUid = uid;
}

export function getCurrentUid(): string | null {
    return _currentUid;
}
