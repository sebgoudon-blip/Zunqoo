import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { api, getToken, setToken, setUnauthorizedHandler, type Me } from "./api";

interface AuthState {
  me: Me | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  refresh: () => Promise<void>;
  hasModule: (key: string) => boolean;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(Boolean(getToken()));

  const logout = useCallback(() => {
    setToken(null);
    setMe(null);
  }, []);

  const refresh = useCallback(async () => {
    if (!getToken()) return;
    try {
      setMe(await api.get<Me>("/api/me"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    setUnauthorizedHandler(logout);
    refresh().catch(() => logout());
  }, [logout, refresh]);

  const login = async (email: string, password: string) => {
    const { token } = await api.post<{ token: string }>("/api/auth/login", { email, password });
    setToken(token);
    setLoading(true);
    await refresh();
  };

  const hasModule = (key: string) => Boolean(me?.modules.includes(key));

  return (
    <AuthContext.Provider value={{ me, loading, login, logout, refresh, hasModule }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth hors de AuthProvider");
  return ctx;
}
