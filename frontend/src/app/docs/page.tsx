"use client";

import React, { useState, useEffect } from "react";
import { Typography, Spin, Card, Tag, Space } from "antd";
import {
  CommandCard,
  ModelSelect,
  StreamToggle,
  QuickInfo,
  ApiEndpoints,
} from "@/components/docs";
import {
  CodeOutlined,
  ThunderboltOutlined,
  GlobalOutlined,
} from "@ant-design/icons";

const { Title, Text, Paragraph } = Typography;

// ========== 动态检测后端地址 ==========
async function detectApiBase(): Promise<string> {
  const candidates = [
    process.env.NEXT_PUBLIC_API_BASE || "",
    typeof window !== "undefined" ? window.location.origin : "",
    "http://127.0.0.1:18400",
    "http://localhost:18400",
  ].filter(Boolean);

  const unique = [...new Set(candidates)];

  for (const base of unique) {
    try {
      const res = await fetch(`${base}/health`, {
        method: "GET",
        signal: AbortSignal.timeout(3000),
      });
      if (res.ok) return base;
    } catch {
      // 连不上，试下一个
    }
  }

  return process.env.NEXT_PUBLIC_API_BASE || window.location.origin;
}

export default function DocsPage() {
  const [selectedModel, setSelectedModel] = useState("");
  const [streamMode, setStreamMode] = useState<"stream" | "non-stream">(
    "stream"
  );
  const [apiBase, setApiBase] = useState("");
  const [detecting, setDetecting] = useState(true);

  useEffect(() => {
    detectApiBase().then((url) => {
      setApiBase(url);
      setDetecting(false);
    });
  }, []);

  const stream = streamMode === "stream";

  // ========== 模型列表命令 ==========
  const curlModelsWithJq = [
    `curl -s ${apiBase}/v1/models \\`,
    `  -H "Authorization: Bearer admin" | jq .`,
  ].join("\n");

  const curlModelsWithoutJq = `curl -s ${apiBase}/v1/models -H "Authorization: Bearer admin"`;

  // ========== 对话命令 ==========
  const chatPayload = selectedModel
    ? JSON.stringify(
        {
          model: selectedModel,
          messages: [{ role: "user", content: "你好" }],
          stream,
        },
        null,
        2
      )
    : "";

  const chatPayloadCompact = selectedModel
    ? JSON.stringify({
        model: selectedModel,
        messages: [{ role: "user", content: "你好" }],
        stream,
      })
    : "";

  const curlChatWithJq = selectedModel
    ? [
        `curl -s ${apiBase}/v1/chat/completions \\`,
        `  -H "Content-Type: application/json" \\`,
        `  -H "Authorization: Bearer admin" \\`,
        `  -d '${chatPayload}' | jq .`,
      ].join("\n")
    : "选择模型后自动生成 curl 命令";

  const curlChatWithoutJq = selectedModel
    ? `curl -s ${apiBase}/v1/chat/completions -H "Content-Type: application/json" -H "Authorization: Bearer admin" -d '${chatPayloadCompact}'`
    : "选择模型后自动生成 curl 命令";

  if (detecting) {
    return (
      <div style={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: "60vh" }}>
        <Spin size="large" tip="正在检测后端地址...">
          <div style={{ padding: 50 }} />
        </Spin>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 900, margin: "0 auto", padding: "24px 24px 0 24px" }}>
      {/* ===== 页面标题 ===== */}
      <div style={{ marginBottom: 40 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
          <div style={{
            width: 40,
            height: 40,
            borderRadius: 10,
            background: "linear-gradient(135deg, #1677ff 0%, #4096ff 100%)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            boxShadow: "0 4px 12px rgba(22, 119, 255, 0.3)",
          }}>
            <CodeOutlined style={{ color: "#fff", fontSize: 20 }} />
          </div>
          <Title level={2} style={{ margin: 0, fontWeight: 600 }}>
            API 文档
          </Title>
        </div>
        <Paragraph type="secondary" style={{ fontSize: 15, margin: 0 }}>
          TransparentLLM 兼容 OpenAI API 格式，将客户端指向代理地址即可使用。
        </Paragraph>
      </div>

      {/* ===== 快速开始 ===== */}
      <QuickInfo apiBase={apiBase} />

      {/* ===== 查看模型列表 ===== */}
      <CommandCard
        title="📋 查看模型列表"
        description="查询已配置的上游模型"
        commandWithJq={curlModelsWithJq}
        commandWithoutJq={curlModelsWithoutJq}
      />

      {/* ===== 调用对话 ===== */}
      <Card
        style={{
          marginBottom: 24,
          borderRadius: 16,
          border: "1px solid rgba(0,0,0,0.06)",
          boxShadow: "0 2px 8px rgba(0,0,0,0.04)",
        }}
      >
        <div style={{ marginBottom: 20 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
            <span style={{ fontSize: 18 }}>💬</span>
            <Text strong style={{ fontSize: 15 }}>调用对话</Text>
            <Text type="secondary" style={{ fontSize: 13 }}>测试对话功能</Text>
          </div>
        </div>
        <div style={{
          background: "#fafafa",
          borderRadius: 12,
          padding: 16,
          marginBottom: 16,
        }}>
          <Space style={{ marginBottom: 0 }} wrap>
            <ModelSelect value={selectedModel} onChange={setSelectedModel} />
            <StreamToggle value={streamMode} onChange={setStreamMode} />
          </Space>
        </div>
        <CommandCard
          title=""
          commandWithJq={curlChatWithJq}
          commandWithoutJq={curlChatWithoutJq}
        />
      </Card>

      {/* ===== API 端点 ===== */}
      <ApiEndpoints />
    </div>
  );
}