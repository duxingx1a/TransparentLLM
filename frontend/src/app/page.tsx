"use client";

import { useEffect } from "react";
import { Spin } from "antd";
import { appPath } from "@/lib/paths";

/** 首页：直接跳转到登录页，登录页会自行检查登录状态 */
export default function Home() {
  useEffect(() => {
    window.location.replace(appPath("/login"));
  }, []);

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
