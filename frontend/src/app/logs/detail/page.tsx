"use client";

import React, { Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import {
  Card, Descriptions, Tag, Typography, Button, Spin, Empty, Space,
} from "antd";
import {
  ArrowLeftOutlined, RobotOutlined, UserOutlined, SettingOutlined,
} from "@ant-design/icons";
import { useQuery } from "@tanstack/react-query";
import { logsApi } from "@/lib/api";
import type { RequestLogDetail } from "@/types";
import dayjs from "dayjs";

const { Title, Text, Paragraph } = Typography;

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}
function formatSpend(n: number): string {
  return `¥${n.toFixed(4)}`;
}

function LogDetailContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const id = searchParams.get("id") || "";

  const { data, isLoading, error } = useQuery<RequestLogDetail>({
    queryKey: ["log-detail", id],
    queryFn: () => logsApi.detail(id),
    enabled: !!id,
  });

  if (!id) return <Empty description="缺少日志 ID" />;
  if (isLoading) return <div style={{ textAlign: "center", padding: 100 }}><Spin size="large" /></div>;
  if (error) return <Empty description={`加载失败：${error.message}`} />;
  if (!data) return <Empty description="日志不存在" />;

  return (
    <div className="w-full p-6 box-border">
      {/* 固定顶部返回栏 */}
      <div
        style={{
          position: "sticky",
          top: 0,
          zIndex: 100,
          background: "#fff",
          padding: "12px 0",
          marginBottom: 8,
          borderBottom: "1px solid #f0f0f0",
          display: "flex",
          alignItems: "center",
          gap: 12,
        }}
      >
        <Button icon={<ArrowLeftOutlined />} onClick={() => router.push("/logs")}>返回列表</Button>
        <Title level={4} style={{ margin: 0 }}>日志详情</Title>
      </div>

      <Card title="基本信息" style={{ marginBottom: 16 }}>
        <Descriptions bordered size="small" column={{ xs: 1, sm: 2, md: 3 }}>
          <Descriptions.Item label="模型">{data.model_name}</Descriptions.Item>
          <Descriptions.Item label="提供商"><Tag>{data.provider}</Tag></Descriptions.Item>
          <Descriptions.Item label="来源"><Tag color="blue">{data.source_tag}</Tag></Descriptions.Item>
          <Descriptions.Item label="状态"><Tag color={data.status === "success" ? "green" : "red"}>{data.status}</Tag></Descriptions.Item>
          <Descriptions.Item label="总耗时">{formatDuration(data.duration_ms)}</Descriptions.Item>
          {data.tokens_per_second > 0 && <Descriptions.Item label="Token/s"><Text strong>{data.tokens_per_second.toFixed(1)}</Text></Descriptions.Item>}
          <Descriptions.Item label="API 地址">{data.api_base}</Descriptions.Item>
          <Descriptions.Item label="开始时间">{dayjs(data.start_time).format("YYYY-MM-DD HH:mm:ss")}</Descriptions.Item>
          <Descriptions.Item label="结束时间">{dayjs(data.end_time).format("YYYY-MM-DD HH:mm:ss")}</Descriptions.Item>
          {data.completion_start_time && (
            <Descriptions.Item label="首 Token 时间">{dayjs(data.completion_start_time).format("YYYY-MM-DD HH:mm:ss")}</Descriptions.Item>
          )}
        </Descriptions>
      </Card>

      <Card title="用量信息" style={{ marginBottom: 16 }}>
        <Descriptions bordered size="small" column={{ xs: 1, sm: 2, md: 3 }}>
          <Descriptions.Item label="总 Token"><Text strong>{data.total_tokens}</Text></Descriptions.Item>
          <Descriptions.Item label="输入 Token">{data.prompt_tokens}</Descriptions.Item>
          <Descriptions.Item label="输出 Token">{data.completion_tokens}</Descriptions.Item>
          <Descriptions.Item label="费用"><Text strong style={{ color: "#fa8c16" }}>{formatSpend(data.spend)}</Text></Descriptions.Item>
          <Descriptions.Item label="缓存命中">{data.cache_hit ? <Tag color="gold">是</Tag> : <Tag>否</Tag>}</Descriptions.Item>
          {data.cached_tokens > 0 && <Descriptions.Item label="缓存 Token"><Text style={{ color: "#faad14" }}>{data.cached_tokens}</Text></Descriptions.Item>}
          {data.cache_key && <Descriptions.Item label="缓存 Key"><code>{data.cache_key}</code></Descriptions.Item>}
        </Descriptions>
      </Card>

      {data.messages && data.messages.length > 0 && (() => {
        // 构建对话流：用户消息 + 思考过程 + 最终回复
        const conversation: Array<{ role: string; content: string; type?: string }> = data.messages.map((m) => ({ role: m.role, content: m.content }));

        // 优先使用后端拆分的 thinking_text / reply_text
        let thinkingText = data.thinking_text || "";
        let replyText = data.reply_text || "";

        // 兼容旧数据：从 response 中提取
        if (!thinkingText && !replyText && data.response) {
          try {
            const resp = typeof data.response === "string" ? JSON.parse(data.response) : data.response;
            const msg = resp?.choices?.[0]?.message;
            if (msg) {
              replyText = msg.content || "";
              thinkingText = msg.reasoning || msg.reasoning_content || "";
              if (!replyText && thinkingText) { replyText = ""; }
            }
          } catch { /* ignore */ }
        }

        if (thinkingText) {
          conversation.push({ role: "assistant", content: thinkingText, type: "thinking" });
        }
        if (replyText) {
          conversation.push({ role: "assistant", content: replyText, type: "reply" });
        } else if (!thinkingText && data.response_text) {
          conversation.push({ role: "assistant", content: data.response_text });
        }
        return (
          <Card title="对话记录" style={{ marginBottom: 16 }}>
            {conversation.map((msg, index) => {
              const isLastMessage = index === conversation.length - 1;
              const isAssistant = msg.role === "assistant";
              const isThinking = (msg as any).type === "thinking";
              const isReply = (msg as any).type === "reply";
              const bgColor = isThinking ? "#fffbe6" : msg.role === "user" ? "#e6f4ff" : isReply ? "#f6ffed" : "#fafafa";
              const borderColor = isThinking ? "#ffe58f" : msg.role === "user" ? "#91caff" : isAssistant ? "#b7eb8f" : "#d9d9d9";
              return (
                <div
                  key={index}
                  style={{
                    marginBottom: 12,
                    padding: "10px 14px",
                    borderRadius: 8,
                    background: bgColor,
                    border: `1px solid ${borderColor}`,
                  }}
                >
                  <div style={{ marginBottom: 4 }}>
                    {msg.role === "system" && <Space><SettingOutlined /><Text strong>System</Text></Space>}
                    {msg.role === "user" && <Space><UserOutlined /><Text strong>User</Text></Space>}
                    {isAssistant && isThinking && <Space><RobotOutlined /><Text strong style={{ color: "#d48806" }}>思考过程</Text> <Tag color="warning" style={{ marginLeft: 4 }}>Thinking</Tag></Space>}
                    {isAssistant && isReply && <Space><RobotOutlined /><Text strong>Assistant</Text> <Tag color="green" style={{ marginLeft: 4 }}>AI 回复</Tag></Space>}
                    {isAssistant && !isThinking && !isReply && <Space><RobotOutlined /><Text strong>Assistant</Text></Space>}
                  </div>
                  <Paragraph style={{ margin: 0, whiteSpace: "pre-wrap", wordBreak: "break-word", maxHeight: isLastMessage && isAssistant ? 600 : 300, overflow: "auto" }}>
                    {msg.content}
                  </Paragraph>
                </div>
              );
            })}
          </Card>
        );
      })()}

      {data.error_msg && (
        <Card title="错误信息" style={{ marginBottom: 16, borderColor: "#ff4d4f" }}>
          <Text type="danger">{data.error_msg}</Text>
        </Card>
      )}
    </div>
  );
}

export default function LogDetailPage() {
  return (
    <Suspense fallback={<div style={{ textAlign: "center", padding: 100 }}><Spin size="large" /></div>}>
      <LogDetailContent />
    </Suspense>
  );
}
