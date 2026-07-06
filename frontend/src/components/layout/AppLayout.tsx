"use client";

import React, { useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { Layout, Menu, Button, Typography } from "antd";
import {
  BarChartOutlined,
  BlockOutlined,
  CloudServerOutlined,
  ExperimentOutlined,
  LineChartOutlined,
  SettingOutlined,
  BookOutlined,
  LogoutOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
} from "@ant-design/icons";
import { useAuth } from "@/contexts/AuthContext";
import PageTransition from "./PageTransition";

const { Sider, Content } = Layout;
const { Text } = Typography;

const menuItems = [
  { key: "/dashboard", icon: <BarChartOutlined />, label: "用量总览" },
  { key: "/providers", icon: <CloudServerOutlined />, label: "提供商管理" },
  { key: "/models", icon: <BlockOutlined />, label: "模型管理" },
  { key: "/playground", icon: <ExperimentOutlined />, label: "Playground" },
  { key: "/logs", icon: <LineChartOutlined />, label: "请求日志" },
  { key: "/settings", icon: <SettingOutlined />, label: "系统设置" },
  { key: "/docs", icon: <BookOutlined />, label: "使用文档" },
];

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { logout } = useAuth();
  const [collapsed, setCollapsed] = useState(false);

  const selectedKey =
    menuItems.find((item) => pathname.startsWith(item.key))?.key ||
    "/dashboard";

  // 静态导出模式下 router.prefetch() 会触发 RSC 请求（全部 404），
  // 不仅无用还占用浏览器并发连接数，拖慢正常请求，已移除。

  return (
    <Layout style={{ minHeight: "100vh" }}>
      <Sider
        trigger={null}
        collapsible
        collapsed={collapsed}
        width={220}
        style={{
          overflow: "auto",
          height: "100vh",
          position: "fixed",
          left: 0,
          top: 0,
          bottom: 0,
          zIndex: 10,
          background: "#fff",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
        {/* 顶部：折叠按钮 + 品牌名 同一行 */}
        <div
          style={{
            height: 56,
            display: "flex",
            alignItems: "center",
            paddingLeft: collapsed ? 16 : 20,
            flexShrink: 0,
          }}
        >
          <Button
            type="text"
            size="small"
            icon={collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
            onClick={() => setCollapsed(!collapsed)}
            style={{ fontSize: 14 }}
          />
          {!collapsed && (
            <Text strong style={{ fontSize: 16, whiteSpace: "nowrap", marginLeft: 8 }}>
              🔍  TransparentLLM
            </Text>
          )}
        </div>

        {/* 菜单区域 */}
        <Menu
          mode="inline"
          selectedKeys={[selectedKey]}
          items={menuItems}
          onClick={({ key }) => router.push(key)}
          style={{ borderRight: 0, paddingTop: 8, flex: 1, overflow: "auto" }}
        />

        {/* 底部登出 */}
        <div style={{ flexShrink: 0, padding: "4px 0" }}>
          <Button
            type="text"
            icon={<LogoutOutlined />}
            onClick={() => logout()}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: collapsed ? "center" : "flex-start",
              width: "100%",
              paddingLeft: collapsed ? 0 : 20,
            }}
          >
            {!collapsed && "登出"}
          </Button>
        </div>
        </div>
      </Sider>

      {/* 内容区 */}
      <Layout style={{ marginLeft: collapsed ? 80 : 220, transition: "margin-left 0.2s", background: "#fff" }}>
        <Content style={{ margin: 24, background: "#fff" }}>
          <div style={{ minHeight: "calc(100vh - 48px)" }}>
            <PageTransition>{children}</PageTransition>
          </div>
        </Content>
      </Layout>
    </Layout>
  );
}
