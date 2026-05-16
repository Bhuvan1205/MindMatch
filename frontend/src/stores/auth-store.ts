import { create } from "zustand";
import { persist } from "zustand/middleware";

import type { AuthUser } from "@/lib/api/types";

type AuthState = {
  token: string | null;
  user: AuthUser | null;
  setAuth: (token: string, user: AuthUser) => void;
  clearAuth: () => void;
  isAuthenticated: () => boolean;
};

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      token: null,
      user: null,

      setAuth: (token, user) => {
        // Also write a non-httpOnly cookie so Next.js middleware can read it
        if (typeof document !== "undefined") {
          document.cookie = `mm-token=${token}; path=/; max-age=${7 * 24 * 60 * 60}; SameSite=Lax`;
        }
        set({ token, user });
      },

      clearAuth: () => {
        if (typeof document !== "undefined") {
          document.cookie = "mm-token=; path=/; max-age=0";
        }
        set({ token: null, user: null });
      },

      isAuthenticated: () => get().token !== null,
    }),
    {
      name: "mindmatch-auth",
    },
  ),
);
