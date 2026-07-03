"use client";

import React, { useEffect, useMemo } from "react";
import { Spin } from "antd";
import { useAuth } from "@/contexts/AuthContext";
import AppLayout from "@/components/layout/AppLayout";
import { appPath } from "@/lib/paths";

/** 受保护的布局组件：同步检查 + 异步验证双重保护 */
export default function ProtectedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { isAuthenticated, isLoading } = useAuth();

  // 同步检查：如果 localStorage 中根本没有 key，直接重定向，不等 React 渲染
  const hasLocalKey = useMemo(() => {
    if (typeof window === "undefined") return true; // SSR 安全
    return localStorage.getItem("master_key") !== null;
  }, []);

  // 同步重定向：没有 key 时在首次渲染前就跳转
  if (!hasLocalKey) {
    if (typeof window !== "undefined") {
      window.location.replace(appPath("/login"));
    }
    return null;
  }

  // 异步验证完成后，如果未通过认证则重定向
  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      // 清除残留的无效 key
      localStorage.removeItem("master_key");
      window.location.replace(appPath("/login"));
    }
  }, [isLoading, isAuthenticated]);

  // 加载中或未认证 → 显示 loading（不会看到受保护内容）
  if (isLoading || !isAuthenticated) {
    return (
      <div
        style={{
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          height: "100vh",
        }}
      >
        <Spin size="large" />
      </div>
    );
  }

  return <AppLayout>{children}</AppLayout>;
}
