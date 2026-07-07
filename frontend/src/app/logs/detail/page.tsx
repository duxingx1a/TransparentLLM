"use client";

import React, { Suspense, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import {
  Card, Descriptions, Tag, Typography, Button, Spin, Empty, Space,
} from "antd";
import {
  ArrowLeftOutlined, RobotOutlined, UserOutlined, SettingOutlined,
  DownOutlined, RightOutlined,
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

/** 可折叠消息卡片 — 长内容限制渲染高度，可滚动查看全部 */
function CollapsibleMessage({ children, defaultCollapsed = false }: { children: React.ReactNode; defaultCollapsed?: boolean }) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed);
  const contentRef = React.useRef<HTMLDivElement>(null);
  const [isLong, setIsLong] = useState(false);

  React.useEffect(() => {
    if (contentRef.current) {
      setIsLong(contentRef.current.scrollHeight > 300);
    }
  }, [children]);

  return (
    <div>
      <div
        ref={contentRef}
        style={{
          maxHeight: collapsed ? 100 : isLong ? 500 : undefined,
          overflow: "auto",
          transition: collapsed ? "max-height 0.3s ease" : undefined,
        }}
      >
        {children}
      </div>
      {collapsed && (
        <div
          onClick={() => setCollapsed(false)}
          style={{
            textAlign: "center", cursor: "pointer", padding: "4px 0",
            color: "#1677ff", fontSize: 12, userSelect: "none",
          }}
        >
          <DownOutlined /> 展开全部
        </div>
      )}
    </div>
  );
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
          {"ttft_ms" in data && (data as any).ttft_ms ? <Descriptions.Item label="TTFT">{formatDuration((data as any).ttft_ms)}</Descriptions.Item> : null}
          <Descriptions.Item label="速率">{data.tokens_per_second > 0 ? `${data.tokens_per_second.toFixed(1)} t/s` : "-"}</Descriptions.Item>
          <Descriptions.Item label="API 地址">{data.api_base}</Descriptions.Item>
          <Descriptions.Item label="开始时间">{dayjs(data.start_time).format("YYYY-MM-DD HH:mm:ss")}</Descriptions.Item>
          <Descriptions.Item label="结束时间">{dayjs(data.end_time).format("YYYY-MM-DD HH:mm:ss")}</Descriptions.Item>
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
        // 构建对话流
        const conversation: Array<{ role: string; content: string; type?: string }> = data.messages.map((m) => ({
          role: m.role,
          content: typeof m.content === "string" ? m.content : JSON.stringify(m.content, null, 2),
        }));

        let thinkingText = data.thinking_text || "";
        let replyText = data.reply_text || "";
        if (!thinkingText && !replyText && data.response) {
          try {
            const resp = typeof data.response === "string" ? JSON.parse(data.response) : data.response;
            const msg = resp?.choices?.[0]?.message;
            if (msg) {
              replyText = msg.content || "";
              thinkingText = msg.reasoning || msg.reasoning_content || "";
            }
          } catch { /* ignore */ }
        }
        if (thinkingText) conversation.push({ role: "assistant", content: thinkingText, type: "thinking" });
        if (replyText) conversation.push({ role: "assistant", content: replyText, type: "reply" });
        else if (!thinkingText && data.response_text) conversation.push({ role: "assistant", content: data.response_text });

        // 如果有错误信息也加入对话流
        if (data.error_msg) {
          conversation.push({ role: "error", content: data.error_msg, type: "error" });
        }

        return (
          <Card title="对话记录" style={{ marginBottom: 16 }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {conversation.map((msg, index) => {
                const isUser = msg.role === "user";
                const isSystem = msg.role === "system";
                const isError = msg.role === "error" || (msg as any).type === "error";
                const isThinking = (msg as any).type === "thinking";
                const isReply = (msg as any).type === "reply";
                const isAssistant = msg.role === "assistant";

                // 用户消息：靠右，宽度 15%~100%
                // 模型/system/error 消息：靠左，宽度 0%~85%
                return (
                  <div key={index} style={{ display: "flex", justifyContent: isUser ? "flex-end" : "flex-start" }}>
                    <div style={{
                      maxWidth: isUser ? "85%" : "85%",
                      padding: "10px 14px",
                      borderRadius: 12,
                      borderTopRightRadius: isUser ? 4 : 12,
                      borderTopLeftRadius: isUser ? 12 : 4,
                      background: isError ? "#fff2f0" : isThinking ? "#fffbe6" : isReply ? "#f6ffed" : isUser ? "#e6f4ff" : isSystem ? "#f5f5f5" : "#fafafa",
                      border: `1px solid ${isError ? "#ffccc7" : isThinking ? "#ffe58f" : isReply ? "#b7eb8f" : isUser ? "#91caff" : isSystem ? "#d9d9d9" : "#e6e6e6"}`,
                      boxShadow: "0 1px 2px rgba(0,0,0,0.04)",
                    }}>
                      <div style={{ marginBottom: 4, display: "flex", alignItems: "center", gap: 6 }}>
                        {isUser && <><UserOutlined style={{ color: "#1677ff" }} /><Text strong style={{ fontSize: 12, color: "#1677ff" }}>用户</Text></>}
                        {isSystem && <><SettingOutlined style={{ color: "#8c8c8c" }} /><Text strong style={{ fontSize: 12, color: "#8c8c8c" }}>System</Text></>}
                        {isError && <><Text strong style={{ fontSize: 12, color: "#ff4d4f" }}>❌ 错误</Text></>}
                        {isThinking && <><RobotOutlined style={{ color: "#d48806" }} /><Text strong style={{ fontSize: 12, color: "#d48806" }}>思考过程</Text></>}
                        {isReply && <><RobotOutlined style={{ color: "#52c41a" }} /><Text strong style={{ fontSize: 12, color: "#52c41a" }}>AI 回复</Text></>}
                        {isAssistant && !isThinking && !isReply && !isError && <><RobotOutlined style={{ color: "#1677ff" }} /><Text strong style={{ fontSize: 12, color: "#1677ff" }}>Assistant</Text></>}
                      </div>
                      <CollapsibleMessage defaultCollapsed={isThinking || isReply || isError}>
                        <div style={{
                          whiteSpace: "pre-wrap",
                          wordBreak: "break-word",
                          fontSize: 13,
                          lineHeight: 1.7,
                          color: isError ? "#ff4d4f" : "#333",
                          contentVisibility: "auto",
                          containIntrinsicSize: "0 200px",
                        }}>
                          {msg.content}
                        </div>
                      </CollapsibleMessage>
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>
        );
      })()}

      {/* 错误信息单独展示（始终显示，不依赖对话流） */}
      {data.error_msg && data.messages?.length === 0 && (
        <Card title="错误信息" style={{ marginBottom: 16, borderColor: "#ff4d4f" }} headStyle={{ borderColor: "#ff4d4f" }}>
          <Text type="danger" style={{ whiteSpace: "pre-wrap" }}>{data.error_msg}</Text>
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
