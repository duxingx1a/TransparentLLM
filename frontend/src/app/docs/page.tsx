"use client";

import React, { useState } from "react";
import { Card, Typography, Divider, Tag, Space, Alert, Select, Button, message } from "antd";
import { ApiOutlined, CopyOutlined } from "@ant-design/icons";
import { useQuery } from "@tanstack/react-query";
import { modelsApi } from "@/lib/api";

const { Title, Text, Paragraph } = Typography;

export default function DocsPage() {
  const { data: modelsData } = useQuery({ queryKey: ["models"], queryFn: modelsApi.list });
  const models = modelsData?.models || [];

  const [selectedModel, setSelectedModel] = useState("");

  const curlCommand = selectedModel
    ? `curl -X POST http://127.0.0.1:14000/v1/chat/completions \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer <您的密钥>" \\
  -d '${JSON.stringify({ model: selectedModel, messages: [{ role: "user", content: "你好" }], stream: true }, null, 2)}'`
    : "";

  const copyToClipboard = () => {
    navigator.clipboard.writeText(curlCommand).then(() => message.success("已复制"));
  };

  return (
    <div>
      <Title level={4} style={{ marginBottom: 24 }}>
        使用文档
      </Title>

      {/* 快速开始 */}
      <Card style={{ marginBottom: 24 }}>
        <Title level={5}>
          <ApiOutlined /> 快速开始
        </Title>
        <Paragraph>
          TransparentLLM 是一个本地运行的 LLM 代理网关。启动后，将您的 LLM
          客户端指向代理地址即可开始使用。
        </Paragraph>
        <Alert
          message="代理地址"
          description={
            <code style={{ fontSize: 14 }}>
              http://127.0.0.1:4001/v1/chat/completions
            </code>
          }
          type="info"
          showIcon
          style={{ marginBottom: 12 }}
        />
        <Alert
          message="认证方式"
          description={
            <Space direction="vertical" size={4}>
              <Text>
                在所有 API 请求中添加 HTTP Header：
                <Tag>Authorization: Bearer &lt;您的主密钥&gt;</Tag>
              </Text>
            </Space>
          }
          type="warning"
          showIcon
        />
      </Card>

      {/* 配置客户端 */}
      <Card title="🔧 配置客户端" style={{ marginBottom: 24 }}>
        <Divider orientation="left">Cursor</Divider>
        <Paragraph>
          在 Cursor 设置中添加自定义 API Base URL。设置 → Models →
          OpenAI API Key 填写主密钥，Base URL 设为
          <code> http://127.0.0.1:4001/v1</code>
        </Paragraph>

        <Divider orientation="left">VS Code Copilot</Divider>
        <Paragraph>
          使用类似
          <code> continue.dev</code> 或
          <code> codegpt</code> 等插件，配置 OpenAI-compatible provider：
        </Paragraph>
        <pre
          style={{
            background: "#f5f5f5",
            padding: 16,
            borderRadius: 8,
            fontSize: 13,
            overflow: "auto",
          }}
        >{`{
  "provider": "openai",
  "apiKey": "您的主密钥",
  "apiBase": "http://127.0.0.1:4001/v1"
}`}</pre>

        <Divider orientation="left">Python (openai SDK)</Divider>
        <pre
          style={{
            background: "#f5f5f5",
            padding: 16,
            borderRadius: 8,
            fontSize: 13,
            overflow: "auto",
          }}
        >{`from openai import OpenAI

client = OpenAI(
    api_key="您的主密钥",
    base_url="http://127.0.0.1:4001/v1"
)

response = client.chat.completions.create(
    model="gpt-4o",
    messages=[{"role": "user", "content": "你好"}]
)`}</pre>

        <Divider orientation="left">curl（一行命令）</Divider>
        <Space style={{ marginBottom: 12 }}>
          <Text strong>选择模型：</Text>
          <Select
            value={selectedModel || undefined}
            onChange={setSelectedModel}
            style={{ width: 260 }}
            options={models.map(m => ({ label: m.model_name, value: m.model_name }))}
            placeholder="选择已配置的模型"
          />
        </Space>
        {selectedModel && (
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
              <Text type="secondary">复制到终端直接运行：</Text>
              <Button size="small" icon={<CopyOutlined />} onClick={copyToClipboard}>复制</Button>
            </div>
            <pre style={{ background: "#1e1e1e", color: "#d4d4d4", padding: 16, borderRadius: 8, fontSize: 13, overflow: "auto", lineHeight: 1.6 }}>
              {curlCommand}
            </pre>
          </div>
        )}
      </Card>

      {/* 添加模型 */}
      <Card title="📦 添加上游模型" style={{ marginBottom: 24 }}>
        <Paragraph>
          在「模型管理」页面添加您需要使用的上游模型。填入模型名称、提供商类型、API
          地址和 API Key 即可。
        </Paragraph>
        <Paragraph>
          <Text strong>支持的模型类型：</Text>
        </Paragraph>
        <Space wrap>
          <Tag color="blue">chat - 对话模型</Tag>
          <Tag color="green">embedding - 嵌入模型</Tag>
          <Tag color="purple">image - 图像模型</Tag>
          <Tag color="orange">audio - 音频模型</Tag>
        </Space>
        <Divider />
        <Paragraph>
          <Text strong>支持的提供商：</Text>
        </Paragraph>
        <Space wrap>
          <Tag color="green">openai - OpenAI / 兼容接口</Tag>
          <Tag color="orange">anthropic - Anthropic Claude</Tag>
          <Tag>custom - 自定义（通用 OpenAI 格式解析）</Tag>
        </Space>
      </Card>

      {/* API 端点列表 */}
      <Card title="📡 代理 API 端点" style={{ marginBottom: 24 }}>
        <Space direction="vertical" style={{ width: "100%" }}>
          <div>
            <Tag color="blue">POST</Tag>
            <code>/v1/chat/completions</code>
            <Text type="secondary"> — 对话补全（支持 SSE 流式）</Text>
          </div>
          <div>
            <Tag color="green">POST</Tag>
            <code>/v1/embeddings</code>
            <Text type="secondary"> — 文本嵌入</Text>
          </div>
          <div>
            <Tag>POST</Tag>
            <code>/v1/*</code>
            <Text type="secondary"> — 通用透传（图像、音频等）</Text>
          </div>
        </Space>
      </Card>

      {/* 环境变量 */}
      <Card title="⚙️ 环境变量配置" style={{ marginBottom: 24 }}>
        <Space direction="vertical" style={{ width: "100%" }}>
          <div>
            <Tag>TRANSPARENTLLM_MASTER_KEY</Tag>
            <Text type="secondary"> — 主密钥（必填，首次启动时设置）</Text>
          </div>
          <div>
            <Tag>TRANSPARENTLLM_ENCRYPTION_KEY</Tag>
            <Text type="secondary">
              {" "}
              — 上游 API Key 加密密钥（必填）
            </Text>
          </div>
          <div>
            <Tag>TRANSPARENTLLM_HOST</Tag>
            <Text type="secondary">
              {" "}
              — 监听地址（默认 127.0.0.1）
            </Text>
          </div>
          <div>
            <Tag>TRANSPARENTLLM_PORT</Tag>
            <Text type="secondary"> — 监听端口（默认 4001）</Text>
          </div>
          <div>
            <Tag>TRANSPARENTLLM_DB_PATH</Tag>
            <Text type="secondary">
              {" "}
              — 数据库路径（默认 data/transparentllm.db）
            </Text>
          </div>
        </Space>
      </Card>
    </div>
  );
}
