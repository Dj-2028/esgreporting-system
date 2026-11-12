import { create } from 'zustand';

/**
 * Auth store (frontend.md §4).
 * Access token is kept strictly in memory (never localStorage).
 */
export const useAuthStore = create((set, get) => ({
  user: null,
  accessToken: null,
  status: 'loading', // 'loading' | 'authed' | 'anon'

  setSession: ({ user, accessToken }) =>
    set({
      user: user ?? get().user,
      accessToken: accessToken ?? get().accessToken,
      status: 'authed',
    }),

  setAccessToken: (accessToken) => set({ accessToken }),

  setUser: (user) => set({ user, status: user ? 'authed' : 'anon' }),

  clearSession: () => set({ user: null, accessToken: null, status: 'anon' }),

  hasRole: (...roles) => {
    const userRoles = get().user?.roles || [];
    return roles.some((r) => userRoles.includes(r));
  },
}));

