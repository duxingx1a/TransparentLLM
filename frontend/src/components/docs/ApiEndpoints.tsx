"use client";

import React from "react";
import { Typography, Tag } from "antd";
import { ApiOutlined } from "@ant-design/icons";

const { Text } = Typography;

interface Endpoint {
  method: string;
  color: string;
  path: string;
  desc: string;
}

const defaultEndpoints: Endpoint[] = [
  { method: "GET", color: "green", path: "/v1/models", desc: "查看可用模型列表" },
  { method: "POST", color: "blue", path: "/v1/chat/completions", desc: "对话补全（支持 SSE 流式）" },
  { method: "POST", color: "blue", path: "/v1/embeddings", desc: "文本嵌入" },
  { method: "POST", color: "default", path: "/v1/*", desc: "通用透传（图像、音频等）" },
];

interface ApiEndpointsProps {
  endpoints?: Endpoint[];
}

export function ApiEndpoints({ endpoints = defaultEndpoints }: ApiEndpointsProps) {
  return (
    <div
      style={{
        background: "#fff",
        borderRadius: 16,
        padding: 24,
        border: "1px solid rgba(0,0,0,0.06)",
        boxShadow: "0 2px 8px rgba(0,0,0,0.04)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20 }}>
        <div
          style={{
            width: 32,
            height: 32,
            borderRadius: 8,
            background: "linear-gradient(135deg, #722ed1 0%, #9254de 100%)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <ApiOutlined style={{ color: "#fff", fontSize: 14 }} />
        </div>
        <Text strong style={{ fontSize: 15 }}>API 端点</Text>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {endpoints.map((ep) => (
          <div
            key={ep.path}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              padding: "12px 16px",
              background: "#fafafa",
              borderRadius: 10,
              border: "1px solid rgba(0,0,0,0.04)",
              transition: "all 0.2s",
            }}
          >
            <Tag
              color={ep.color}
              style={{
                minWidth: 56,
                textAlign: "center",
                borderRadius: 6,
                fontWeight: 600,
                margin: 0,
              }}
            >
              {ep.method}
            </Tag>
            <code
              style={{
                fontSize: 13,
                fontWeight: 500,
                color: "#1f2937",
                background: "rgba(0,0,0,0.04)",
                padding: "2px 8px",
                borderRadius: 4,
              }}
            >
              {ep.path}
            </code>
            <Text type="secondary" style={{ fontSize: 12, marginLeft: "auto" }}>
              {ep.desc}
            </Text>
          </div>
        ))}
      </div>
    </div>
  );
}