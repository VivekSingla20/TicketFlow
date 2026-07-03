import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { api, configureApi } from "./api";

export type User = {
  id: string;
  email: string;
  name?: string;
  role: "USER" | "ADMIN" | string;
};

type AuthState = {
  user: User | null;
  accessToken: string | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<User>;
  register: (data: { name: string; email: string; password: string }) => Promise<User>;
  logout: () => void;
};

const AuthContext = createContext<AuthState | null>(null);

const REFRESH_KEY = "tb_refresh_token";

function decodeJwtExp(token: string): number | null {
  try {
    const payload = JSON.parse(atob(token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
    return typeof payload.exp === "number" ? payload.exp * 1000 : null;
  } catch { return null; }
}

function decodeUserFromJwt(token: string): User | null {
  try {
    const payload = JSON.parse(atob(token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
    return {
      id: payload.sub,
      email: payload.email,
      role: payload.role || "USER",
    };
  } catch { return null; }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const tokenRef = useRef<string | null>(null);
  const refreshTimer = useRef<number | null>(null);

  configureApi({
    getAccessToken: () => tokenRef.current,
    onUnauthorized: () => {
      // Don't auto-clear on every 401; refresh path will handle.
    },
  });

  const applySession = (data: { accessToken: string; refreshToken?: string; user?: User }) => {
    tokenRef.current = data.accessToken;
    setAccessToken(data.accessToken);
    const decodedUser = decodeUserFromJwt(data.accessToken);
    setUser(data.user || decodedUser);
    if (data.refreshToken) {
      try { localStorage.setItem(REFRESH_KEY, data.refreshToken); } catch {}
    }
    scheduleRefresh(data.accessToken);
  };

  const clearSession = () => {
    tokenRef.current = null;
    setAccessToken(null);
    setUser(null);
    try { localStorage.removeItem(REFRESH_KEY); } catch {}
    if (refreshTimer.current) { window.clearTimeout(refreshTimer.current); refreshTimer.current = null; }
  };

  const refresh = async (): Promise<boolean> => {
    const rt = (() => { try { return localStorage.getItem(REFRESH_KEY); } catch { return null; } })();
    try {
      const data = await api<{ accessToken: string; refreshToken?: string; user: User }>(
        "/api/auth/refresh",
        { method: "POST", body: rt ? JSON.stringify({ refreshToken: rt }) : undefined, auth: false },
      );
      applySession(data);
      return true;
    } catch {
      clearSession();
      return false;
    }
  };

  const scheduleRefresh = (token: string) => {
    if (refreshTimer.current) window.clearTimeout(refreshTimer.current);
    const exp = decodeJwtExp(token);
    if (!exp) return;
    const ms = Math.max(10_000, exp - Date.now() - 60_000); // refresh 60s before exp
    refreshTimer.current = window.setTimeout(() => { void refresh(); }, ms);
  };

  useEffect(() => {
    void (async () => {
      await refresh();
      setLoading(false);
    })();
    return () => { if (refreshTimer.current) window.clearTimeout(refreshTimer.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const value = useMemo<AuthState>(() => ({
    user, accessToken, loading,
    login: async (email, password) => {
      const data = await api<{ accessToken: string; refreshToken?: string; user: User }>(
        "/api/auth/login",
        { method: "POST", body: JSON.stringify({ email, password }), auth: false },
      );
      applySession(data);
      return data.user;
    },
    register: async (payload) => {
      // 1. Call register endpoint (returns user details only)
      await api<{ id: string; email: string }>(
        "/api/auth/register",
        { method: "POST", body: JSON.stringify({ email: payload.email, password: payload.password }), auth: false },
      );
      // 2. Call login immediately to obtain session tokens
      const loginData = await api<{ accessToken: string; refreshToken?: string; user: User }>(
        "/api/auth/login",
        { method: "POST", body: JSON.stringify({ email: payload.email, password: payload.password }), auth: false },
      );
      applySession(loginData);
      return loginData.user;
    },
    logout: () => {
      const rt = (() => { try { return localStorage.getItem(REFRESH_KEY); } catch { return null; } })();
      api("/api/auth/logout", {
        method: "POST",
        body: rt ? JSON.stringify({ refreshToken: rt }) : undefined,
      }).catch(() => {});
      clearSession();
    },
  }), [user, accessToken, loading]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
