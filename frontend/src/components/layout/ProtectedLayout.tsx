"use client";

import React, { useEffect } from "react";
import { Spin } from "antd";
import { useAuth } from "@/contexts/AuthContext";
import AppLayout from "@/components/layout/AppLayout";
import { appPath } from "@/lib/paths";

/** 受保护的布局组件：检查登录状态，未认证则跳转登录页 */
export default function ProtectedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { isAuthenticated, isLoading } = useAuth();

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
