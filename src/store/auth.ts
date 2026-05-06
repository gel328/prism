// Zustand auth store
//
// On the server (SSR), localStorage doesn't exist, so the store initializes
// empty. The client-side entry-client.tsx reads window.__INITIAL__.auth and
// calls setAuth() to seed the store before hydration starts, which keeps
// the server-rendered HTML consistent with what the client sees.

import { create } from "zustand";
import type { UserProfile } from "../lib/api";

interface AuthState {
  token: string | null;
  user: UserProfile | null;
  isLoading: boolean;
  setAuth: (token: string, user: UserProfile) => void;
  clearAuth: () => void;
  setLoading: (v: boolean) => void;
}

const isBrowser = typeof localStorage !== "undefined";

function readInitialUser(): UserProfile | null {
  if (!isBrowser) return null;
  const raw = localStorage.getItem("user");
  if (!raw) return null;
  try {
    return JSON.parse(raw) as UserProfile;
  } catch {
    return null;
  }
}

export const useAuthStore = create<AuthState>((set) => ({
  token: isBrowser ? localStorage.getItem("token") : null,
  user: readInitialUser(),
  isLoading: false,

  setAuth: (token, user) => {
    if (isBrowser) {
      localStorage.setItem("token", token);
      localStorage.setItem("user", JSON.stringify(user));
    }
    set({ token, user });
  },

  clearAuth: () => {
    if (isBrowser) {
      localStorage.removeItem("token");
      localStorage.removeItem("user");
    }
    set({ token: null, user: null });
  },

  setLoading: (v) => set({ isLoading: v }),
}));
