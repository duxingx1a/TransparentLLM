"use client";

import React, { useState, useMemo, useCallback, useEffect } from "react";
import {
  Card,
  Typography,
  Divider,
  Tag,
  Space,
  Alert,
  Select,
  Button,
  message,
  Radio,
  Tooltip,
  Spin,
} from "antd";
import {
  ApiOutlined,
  CopyOutlined,
  CheckOutlined,
  CodeOutlined,
  ThunderboltOutlined,
  GlobalOutlined,
} from "@ant-design/icons";
import { useQuery } from "@tanstack/react-query";
import { modelsApi } from "@/lib/api";

const { Title, Text, Paragraph } = Typography;

// ========== 动态检测后端地址 ==========
// 依次尝试多个候选地址，返回第一个能通的
async function detectApiBase(): Promise<string> {
  const candidates = [
    // 1. 环境变量配置（生产环境 = 当前域名）
    process.env.NEXT_PUBLIC_API_BASE || "",
    // 2. 当前页面域名（同源部署时）
    typeof window !== "undefined" ? window.location.origin : "",
    // 3. 开发环境常见地址
    "http://127.0.0.1:18400",
    "http://localhost:18400",
  ].filter(Boolean);

  // 去重
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

  // 全部失败，回退到环境变量或当前域名
  return process.env.NEXT_PUBLIC_API_BASE || window.location.origin;
}

// ---------- 复制按钮组件 ----------
function CopyButton({
  text,
  label,
  size = "small",
}: {
  text: string;
  label?: string;
  size?: "small" | "middle" | "large";
}) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      message.success({
        content: `${label || "命令"} 已复制到剪贴板 ✅`,
        duration: 2,
      });
      setTimeout(() => setCopied(false), 2000);
    });
  }, [text, label]);

  return (
    <Tooltip title={copied ? "已复制!" : "复制到剪贴板"}>
      <Button
        size={size}
        type={copied ? "primary" : "default"}
        icon={copied ? <CheckOutlined /> : <CopyOutlined />}
        onClick={handleCopy}
        style={copied ? { borderColor: "#52c41a", color: "#52c41a" } : {}}
      >
        {copied ? "已复制" : "复制"}
      </Button>
    </Tooltip>
  );
}

// ---------- 代码块组件 ----------
function CodeBlock({
  children,
  language = "bash",
}: {
  children: string;
  language?: string;
}) {
  return (
    <div style={{ position: "relative" }}>
      <div
        style={{
          position: "absolute",
          top: 8,
          right: 12,
          fontSize: 11,
          color: "#6a737d",
          userSelect: "none",
        }}
      >
        {language}
      </div>
      <pre
        style={{
          background: "#0d1117",
          color: "#c9d1d9",
          padding: "16px 16px 16px 16px",
          borderRadius: 8,
          fontSize: 13,
          overflow: "auto",
          lineHeight: 1.7,
          margin: 0,
          border: "1px solid #30363d",
        }}
      >
        <code>{children}</code>
      </pre>
    </div>
  );
}

export default function DocsPage() {
  const { data: modelsData } = useQuery({
    queryKey: ["models"],
    queryFn: modelsApi.list,
  });
  const models = modelsData?.models || [];
  const [selectedModel, setSelectedModel] = useState("");
  const [streamMode, setStreamMode] = useState<"stream" | "non-stream">(
    "stream"
  );

  // 动态检测后端地址
  const [apiBase, setApiBase] = useState("");
  const [detecting, setDetecting] = useState(true);

  useEffect(() => {
    detectApiBase().then((url) => {
      setApiBase(url);
      setDetecting(false);
    });
  }, []);

  const stream = streamMode === "stream";

  // ========== curl 命令生成 ==========
  const curlModelsDisplay = [
    `curl -s ${apiBase}/v1/models \\`,
    `  -H "Authorization: Bearer admin" | jq .`,
  ].join("\n");
  const curlModelsCopy = `curl -s ${apiBase}/v1/models -H "Authorization: Bearer admin" | jq .`;

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

  const curlChatDisplay = selectedModel
    ? [
        `curl -s ${apiBase}/v1/chat/completions \\`,
        `  -H "Content-Type: application/json" \\`,
        `  -H "Authorization: Bearer admin" \\`,
        `  -d '${chatPayload}' | jq .`,
      ].join("\n")
    : "";
  const curlChatCopy = selectedModel
    ? `curl -s ${apiBase}/v1/chat/completions -H "Content-Type: application/json" -H "Authorization: Bearer admin" -d '${chatPayloadCompact}' | jq .`
    : "";

  if (detecting) {
    return (
      <div style={{ textAlign: "center", padding: "80px 0" }}>
        <Spin size="large" tip="正在检测后端地址..." />
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 800 }}>
      {/* ===== 页面标题 ===== */}
      <div style={{ marginBottom: 32 }}>
        <Title level={3} style={{ marginBottom: 8 }}>
          📖 使用文档
        </Title>
        <Text type="secondary">
          TransparentLLM 兼容 OpenAI API 格式，将客户端指向代理地址即可使用。
        </Text>
      </div>

      {/* ===== 快速开始 ===== */}
      <Card
        style={{ marginBottom: 24, borderRadius: 12 }}
        styles={{ body: { padding: "20px 24px" } }}
      >
        <Title level={5} style={{ marginTop: 0, marginBottom: 16 }}>
          <ThunderboltOutlined style={{ color: "#1677ff" }} /> 快速开始
        </Title>

        <Space direction="vertical" size={12} style={{ width: "100%" }}>
          <div
            style={{
              background: "#f0f5ff",
              border: "1px solid #d6e4ff",
              borderRadius: 8,
              padding: "12px 16px",
              display: "flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            <GlobalOutlined style={{ color: "#1677ff", fontSize: 16 }} />
            <div>
              <Text
                type="secondary"
                style={{ fontSize: 12, display: "block", marginBottom: 2 }}
              >
                代理地址（已自动检测）
              </Text>
              <code style={{ fontSize: 14, color: "#1677ff" }}>
                {apiBase}/v1
              </code>
            </div>
          </div>

          <div
            style={{
              background: "#fff7e6",
              border: "1px solid #ffe7ba",
              borderRadius: 8,
              padding: "12px 16px",
            }}
          >
            <Text
              type="secondary"
              style={{ fontSize: 12, display: "block", marginBottom: 4 }}
            >
              认证方式
            </Text>
            <Text style={{ fontSize: 13 }}>
              Header 中携带
              <Tag color="orange" style={{ marginLeft: 8 }}>
                Authorization: Bearer admin
              </Tag>
            </Text>
          </div>
        </Space>
      </Card>

      {/* ===== 查看模型列表 ===== */}
      <Card
        title={
          <span>
            <CodeOutlined style={{ marginRight: 8 }} />
            查看模型列表
          </span>
        }
        style={{ marginBottom: 24, borderRadius: 12 }}
        extra={<CopyButton text={curlModelsCopy} label="GET /v1/models" />}
      >
        <Paragraph type="secondary" style={{ marginBottom: 12 }}>
          查询已配置的上游模型：
        </Paragraph>
        <CodeBlock>{curlModelsDisplay}</CodeBlock>
        <Text
          type="secondary"
          style={{ fontSize: 11, display: "block", marginTop: 8 }}
        >
          💡 <code>jq</code> 可选，用于格式化 JSON 输出。
          <code>apt install jq</code> / <code>brew install jq</code>
        </Text>
      </Card>

      {/* ===== 调用对话 ===== */}
      <Card
        title={
          <span>
            <ApiOutlined style={{ marginRight: 8 }} />
            调用对话
          </span>
        }
        style={{ marginBottom: 24, borderRadius: 12 }}
        extra={
          selectedModel ? (
            <CopyButton text={curlChatCopy} label="对话命令" />
          ) : undefined
        }
      >
        <Space style={{ marginBottom: 16 }} wrap>
          <Text strong>选择模型：</Text>
          <Select
            value={selectedModel || undefined}
            onChange={setSelectedModel}
            style={{ width: 260 }}
            options={models.map((m) => ({
              label: m.model_name,
              value: m.model_name,
            }))}
            placeholder="选择已配置的模型"
          />
          <Radio.Group
            value={streamMode}
            onChange={(e) => setStreamMode(e.target.value)}
            optionType="button"
            buttonStyle="solid"
            size="small"
          >
            <Radio.Button value="stream">流式</Radio.Button>
            <Radio.Button value="non-stream">非流式</Radio.Button>
          </Radio.Group>
        </Space>

        {selectedModel && <CodeBlock>{curlChatDisplay}</CodeBlock>}

        {!selectedModel && (
          <div
            style={{
              textAlign: "center",
              padding: "32px 0",
              color: "#999",
            }}
          >
            👆 选择模型后自动生成 curl 命令
          </div>
        )}
      </Card>

      {/* ===== 添加上游模型 ===== */}
      <Card
        title="📦 添加上游模型"
        style={{ marginBottom: 24, borderRadius: 12 }}
      >
        <Paragraph>
          在「模型管理」页面添加上游模型，填入模型名称、提供商类型、API
          地址和 API Key。
        </Paragraph>
        <Space direction="vertical" size={8} style={{ width: "100%" }}>
          <div>
            <Text strong style={{ marginRight: 8 }}>
              模型类型：
            </Text>
            <Tag color="blue">chat</Tag>
            <Tag color="green">embedding</Tag>
            <Tag color="purple">image</Tag>
            <Tag color="orange">audio</Tag>
          </div>
          <div>
            <Text strong style={{ marginRight: 8 }}>
              提供商：
            </Text>
            <Tag color="green">openai</Tag>
            <Tag color="orange">anthropic</Tag>
            <Tag>custom</Tag>
          </div>
        </Space>
      </Card>

      {/* ===== API 端点 ===== */}
      <Card title="📡 API 端点" style={{ marginBottom: 24, borderRadius: 12 }}>
        <Space direction="vertical" size={12} style={{ width: "100%" }}>
          {(
            [
              { method: "GET", color: "green", path: "/v1/models", desc: "查看可用模型列表" },
              { method: "POST", color: "blue", path: "/v1/chat/completions", desc: "对话补全（支持 SSE 流式）" },
              { method: "POST", color: "blue", path: "/v1/embeddings", desc: "文本嵌入" },
              { method: "POST", color: "default", path: "/v1/*", desc: "通用透传（图像、音频等）" },
            ]
          ).map((ep) => (
            <div
              key={ep.path}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "6px 0",
              }}
            >
              <Tag
                color={ep.color}
                style={{ minWidth: 48, textAlign: "center" }}
              >
                {ep.method}
              </Tag>
              <code style={{ fontSize: 13 }}>{ep.path}</code>
              <Text type="secondary" style={{ fontSize: 12 }}>
                — {ep.desc}
              </Text>
            </div>
          ))}
        </Space>
      </Card>
    </div>
  );
}
