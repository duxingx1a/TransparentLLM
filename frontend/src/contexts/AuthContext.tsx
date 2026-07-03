"use client";

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useRef,
} from "react";
import { authApi } from "@/lib/api";
import { appPath } from "@/lib/paths";

interface AuthContextType {
  /** 是否已认证 */
  isAuthenticated: boolean;
  /** 是否正在检查登录状态 */
  isLoading: boolean;
  /** 登录 */
  login: (masterKey: string) => Promise<void>;
  /** 登出 */
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  isAuthenticated: false,
  isLoading: true,
  login: async () => {},
  logout: async () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  // 乐观认证：有本地 key 就立即认为已认证，不等 check 请求
  const [isAuthenticated, setIsAuthenticated] = useState(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("master_key") !== null;
    }
    return false;
  });
  const [isLoading, setIsLoading] = useState(false); // 不再初始 loading，有 key 直接显示内容
  const checkingRef = useRef(false);
  const hasVerifiedRef = useRef(false); // 防止重复后台验证

  const checkAuth = useCallback(async () => {
    if (checkingRef.current) return;
    checkingRef.current = true;

    const localKey = localStorage.getItem("master_key");
    if (!localKey) {
      setIsAuthenticated(false);
      setIsLoading(false);
      checkingRef.current = false;
      return;
    }
    try {
      const res = await authApi.check();
      setIsAuthenticated(res.authenticated);
      if (!res.authenticated) {
        localStorage.removeItem("master_key");
      }
    } catch {
      // 网络错误时保留当前认证状态（乐观），不强制登出
    } finally {
      setIsLoading(false);
      checkingRef.current = false;
      hasVerifiedRef.current = true;
    }
  }, []);

  // 启动时后台静默验证（不阻塞页面渲染）
  useEffect(() => {
    if (!hasVerifiedRef.current) {
      checkAuth();
    }
  }, [checkAuth]);

  // 页面可见性变化时重新检查（用户切换标签页回来）
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        // 同步检查：如果 key 被其他标签页清除了，立即更新状态
        const localKey = localStorage.getItem("master_key");
        if (!localKey && isAuthenticated) {
          setIsAuthenticated(false);
        }
      }
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [isAuthenticated]);

  // 监听其他标签页的 localStorage 变化（跨标签页同步登出）
  useEffect(() => {
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === "master_key") {
        if (e.newValue === null) {
          // 其他标签页清除了 key → 同步登出
          setIsAuthenticated(false);
        } else if (e.oldValue === null && e.newValue) {
          // 其他标签页设置了 key → 验证新 key
          checkAuth();
        }
      }
    };
    window.addEventListener("storage", handleStorageChange);
    return () => {
      window.removeEventListener("storage", handleStorageChange);
    };
  }, [checkAuth]);

  const login = useCallback(async (masterKey: string) => {
    await authApi.login(masterKey);
    localStorage.setItem("master_key", masterKey);
    setIsAuthenticated(true);
  }, []);

  const logout = useCallback(async () => {
    try {
      await authApi.logout();
    } finally {
      localStorage.removeItem("master_key");
      setIsAuthenticated(false);
      // 使用浏览器原生导航绕过 output:export + basePath 的 RSC 问题
      window.location.replace(appPath("/login"));
    }
  }, []);

  return (
    <AuthContext.Provider value={{ isAuthenticated, isLoading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
