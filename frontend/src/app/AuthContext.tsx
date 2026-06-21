import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { setAccessToken, clearAccessToken, request } from "@/services/apiClient";
import type { Me } from "@/types";

interface AuthCtx {
  user: Me | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const Ctx = createContext<AuthCtx | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);

  // On mount: try to restore session via HttpOnly refresh-token cookie.
  // If the cookie exists the browser sends it automatically; we just get a new access token.
  useEffect(() => {
    request<{ access_token: string }>("/auth/refresh", { method: "POST", auth: false })
      .then((r) => {
        setAccessToken(r.access_token);
        return request<Me>("/auth/me");
      })
      .then(setUser)
      .catch(() => { clearAccessToken(); })
      .finally(() => setLoading(false));
  }, []);

  const login = async (email: string, password: string) => {
    const form = new URLSearchParams({ username: email, password });
    // Backend sets HttpOnly refresh-token cookie and returns access token in body
    const r = await request<{ access_token: string }>(
      "/auth/login",
      { method: "POST", form, auth: false },
    );
    setAccessToken(r.access_token);
    const me = await request<Me>("/auth/me");
    setUser(me);
  };

  const logout = async () => {
    try { await request("/auth/logout", { method: "POST" }); } catch { /* ignore */ }
    clearAccessToken();
    setUser(null);
    window.location.href = "/login";
  };

  return <Ctx.Provider value={{ user, loading, login, logout }}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
