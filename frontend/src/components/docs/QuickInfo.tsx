"use client";

import React from "react";
import { Typography, Tag } from "antd";
import { ThunderboltOutlined, GlobalOutlined, KeyOutlined } from "@ant-design/icons";

const { Text } = Typography;

interface QuickInfoProps {
  apiBase: string;
}

export function QuickInfo({ apiBase }: QuickInfoProps) {
  return (
    <div
      style={{
        marginBottom: 32,
        background: "linear-gradient(135deg, #f0f5ff 0%, #e6f4ff 100%)",
        borderRadius: 16,
        padding: 24,
        border: "1px solid rgba(22, 119, 255, 0.15)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 20 }}>
        <ThunderboltOutlined style={{ color: "#1677ff", fontSize: 18 }} />
        <Text strong style={{ fontSize: 15 }}>快速开始</Text>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        {/* 代理地址 */}
        <div
          style={{
            background: "rgba(255,255,255,0.8)",
            borderRadius: 12,
            padding: "16px",
            border: "1px solid rgba(22, 119, 255, 0.1)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
            <GlobalOutlined style={{ color: "#1677ff", fontSize: 14 }} />
            <Text type="secondary" style={{ fontSize: 12 }}>
              代理地址
            </Text>
          </div>
          <code
            style={{
              fontSize: 14,
              color: "#1677ff",
              fontWeight: 500,
              background: "rgba(22, 119, 255, 0.06)",
              padding: "4px 8px",
              borderRadius: 6,
              display: "inline-block",
            }}
          >
            {apiBase}/v1
          </code>
        </div>

        {/* 认证方式 */}
        <div
          style={{
            background: "rgba(255,255,255,0.8)",
            borderRadius: 12,
            padding: "16px",
            border: "1px solid rgba(250, 140, 22, 0.1)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
            <KeyOutlined style={{ color: "#fa8c16", fontSize: 14 }} />
            <Text type="secondary" style={{ fontSize: 12 }}>
              认证方式
            </Text>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Text style={{ fontSize: 13 }}>Header 中携带</Text>
            <Tag
              color="orange"
              style={{
                margin: 0,
                borderRadius: 6,
                fontWeight: 500,
              }}
            >
              Authorization: Bearer admin
            </Tag>
          </div>
        </div>
      </div>
    </div>
  );
}