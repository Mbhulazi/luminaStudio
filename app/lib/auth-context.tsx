"use client";

import {
  createContext, useContext, useState, useEffect, useCallback, ReactNode,
} from "react";
import { api, getToken, setToken, User, Tier } from "./api";

type AuthContextValue = {
  user: User | null;
  loading: boolean; // initial /me check in flight
  login: (email: string, password: string) => Promise<void>;
  signup: (name: string, email: string, password: string) => Promise<void>;
  logout: () => void;
  refresh: () => Promise<void>;
  hasTier: (min: Tier) => boolean;
};

const AuthContext = createContext<AuthContextValue | null>(null);

const TIER_RANK: Record<Tier, number> = { free: 0, atelier: 1, master: 2 };

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const token = getToken();
    if (!token) {
      setUser(null);
      setLoading(false);
      return;
    }
    try {
      const { user } = await api.get<{ user: User }>("/api/auth/me");
      setUser(user);
    } catch {
      setToken(null);
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  // On mount: if a token exists, confirm it's still valid + pull current tier.
  useEffect(() => {
    refresh();
  }, [refresh]);

  const login = useCallback(async (email: string, password: string) => {
    const { token, user } = await api.post<{ token: string; user: User }>(
      "/api/auth/login",
      { email, password }
    );
    setToken(token);
    setUser(user);
  }, []);

  const signup = useCallback(
    async (name: string, email: string, password: string) => {
      const { token, user } = await api.post<{ token: string; user: User }>(
        "/api/auth/signup",
        { name, email, password }
      );
      setToken(token);
      setUser(user);
    },
    []
  );

  const logout = useCallback(() => {
    setToken(null);
    setUser(null);
  }, []);

  const hasTier = useCallback(
    (min: Tier) => (user ? TIER_RANK[user.tier] >= TIER_RANK[min] : false),
    [user]
  );

  return (
    <AuthContext.Provider value={{ user, loading, login, signup, logout, refresh, hasTier }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within <AuthProvider>");
  return ctx;
}
