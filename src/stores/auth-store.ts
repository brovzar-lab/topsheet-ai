import { create } from 'zustand';
import {
    signInWithPopup,
    signOut as firebaseSignOut,
    onAuthStateChanged,
    type User,
} from 'firebase/auth';
import { auth, googleProvider } from '@/lib/firebase';

interface AuthState {
    user: User | null;
    isLoading: boolean;
    signInWithGoogle: () => Promise<void>;
    signOut: () => Promise<void>;
    _setUser: (user: User | null) => void;
    _setLoading: (loading: boolean) => void;
}

export const useAuthStore = create<AuthState>((set) => ({
    user: null,
    isLoading: true, // true until onAuthStateChanged fires for the first time

    signInWithGoogle: async () => {
        try {
            await signInWithPopup(auth, googleProvider);
        } catch (err) {
            console.error('[Auth] Google sign-in failed:', err);
            throw err;
        }
    },

    signOut: async () => {
        try {
            await firebaseSignOut(auth);
        } catch (err) {
            console.error('[Auth] Sign-out failed:', err);
            throw err;
        }
    },

    _setUser: (user) => set({ user }),
    _setLoading: (isLoading) => set({ isLoading }),
}));

// Boot the auth listener once — updates store whenever auth state changes.
// Lives outside the store so it only registers once regardless of renders.
onAuthStateChanged(auth, (user) => {
    useAuthStore.getState()._setUser(user);
    useAuthStore.getState()._setLoading(false);
});
