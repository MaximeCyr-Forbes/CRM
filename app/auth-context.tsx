"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

type AuthStatus = "loading" | "authenticated" | "unauthenticated";

type AuthContextValue = {
  status: AuthStatus;
  signIn: (password: string) => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>("loading");

  useEffect(() => {
    let active = true;
    void fetch("/api/access/session", { cache: "no-store" })
      .then(async (response) => response.json() as Promise<{ authenticated?: boolean }>)
      .then((result) => {
        if (active) setStatus(result.authenticated ? "authenticated" : "unauthenticated");
      })
      .catch(() => {
        if (active) setStatus("unauthenticated");
      });
    return () => { active = false; };
  }, []);

  const signIn = useCallback(async (password: string) => {
    const response = await fetch("/api/access/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });
    if (!response.ok) {
      const payload = (await response.json().catch(() => null)) as { error?: string } | null;
      throw new Error(payload?.error ?? "Mot de passe incorrect");
    }
    setStatus("authenticated");
  }, []);

  const signOut = useCallback(async () => {
    const response = await fetch("/api/access/logout", { method: "POST" });
    if (!response.ok) throw new Error("Déconnexion impossible.");
    setStatus("unauthenticated");
  }, []);

  const value = useMemo(() => ({ status, signIn, signOut }), [signIn, signOut, status]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth doit être utilisé dans AuthProvider");
  return context;
}
