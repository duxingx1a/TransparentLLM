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

      {/* 完整请求体 */}
      {data.messages && (() => {
        let requestBody: any;
        try {
          requestBody = typeof data.messages === "string" ? JSON.parse(data.messages as unknown as string) : data.messages;
        } catch {
          requestBody = data.messages;
        }
        if (!requestBody) return null;

        // 从完整请求体中提取 messages 用于对话展示
        const rawMessages = requestBody?.messages || (Array.isArray(requestBody) ? requestBody : []);
        const hasTools = requestBody?.tools && requestBody.tools.length > 0;
        const systemMsgs = rawMessages.filter((m: any) => m.role === "system");
        const userMsgs = rawMessages.filter((m: any) => m.role === "user" || m.type === "text");
        const assistantMsgs = rawMessages.filter((m: any) => m.role === "assistant");

        return (
          <>
            {/* 请求参数卡片 */}
            <Card title="请求参数" style={{ marginBottom: 16 }}>
              <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginBottom: 12 }}>
                <Tag>模型: {requestBody.model || data.model_name}</Tag>
                <Tag>流式: {requestBody.stream ? "是" : "否"}</Tag>
                {requestBody.temperature !== undefined && <Tag>温度: {requestBody.temperature}</Tag>}
                {requestBody.max_tokens !== undefined && <Tag>最大Token: {requestBody.max_tokens}</Tag>}
                {hasTools && <Tag color="blue">工具: {requestBody.tools.length} 个</Tag>}
                {requestBody.system && <Tag color="purple">系统提示词</Tag>}
              </div>
              <CollapsibleMessage defaultCollapsed>
                <div style={{
                  background: "#f6f8fa", borderRadius: 8, padding: 12,
                  fontSize: 12, lineHeight: 1.6, color: "#333",
                  maxHeight: 500, overflow: "auto",
                  whiteSpace: "pre-wrap", wordBreak: "break-word",
                  fontFamily: "monospace",
                  contentVisibility: "auto",
                }}>
                  {JSON.stringify(requestBody, null, 2)}
                </div>
              </CollapsibleMessage>
            </Card>

            {/* 对话记录 */}
            <Card title="对话记录" style={{ marginBottom: 16 }}>
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {rawMessages.map((msg: any, index: number) => {
                  const role = msg.role || "unknown";
                  const content = typeof msg.content === "string" ? msg.content
                    : Array.isArray(msg.content) ? msg.content.map((c: any) => c.text || JSON.stringify(c)).join("\n")
                    : typeof msg.content === "object" && msg.content !== null ? JSON.stringify(msg.content, null, 2)
                    : String(msg.content || "");
                  const isUser = role === "user";
                  const isSystem = role === "system";

                  return (
                    <div key={index} style={{ display: "flex", justifyContent: isUser ? "flex-end" : "flex-start" }}>
                      <div style={{
                        maxWidth: "85%", padding: "10px 14px", borderRadius: 12,
                        borderTopRightRadius: isUser ? 4 : 12, borderTopLeftRadius: isUser ? 12 : 4,
                        background: isUser ? "#e6f4ff" : isSystem ? "#f5f5f5" : "#fafafa",
                        border: `1px solid ${isUser ? "#91caff" : isSystem ? "#d9d9d9" : "#e6e6e6"}`,
                        boxShadow: "0 1px 2px rgba(0,0,0,0.04)",
                      }}>
                        <div style={{ marginBottom: 4, display: "flex", alignItems: "center", gap: 6 }}>
                          {isUser && <><UserOutlined style={{ color: "#1677ff" }} /><Text strong style={{ fontSize: 12, color: "#1677ff" }}>用户</Text></>}
                          {isSystem && <><SettingOutlined style={{ color: "#8c8c8c" }} /><Text strong style={{ fontSize: 12, color: "#8c8c8c" }}>System</Text></>}
                          {!isUser && !isSystem && <><RobotOutlined style={{ color: "#1677ff" }} /><Text strong style={{ fontSize: 12, color: "#1677ff" }}>{role}</Text></>}
                        </div>
                        <CollapsibleMessage defaultCollapsed={isSystem}>
                          <div style={{ whiteSpace: "pre-wrap", wordBreak: "break-word", fontSize: 13, lineHeight: 1.7, color: "#333", contentVisibility: "auto" }}>
                            {content || <Text type="secondary">(空消息)</Text>}
                          </div>
                        </CollapsibleMessage>
                      </div>
                    </div>
                  );
                })}
                {/* assistant 回复：从 response 中提取，始终显示 */}
                {data.response_text && (
                  <div style={{ display: "flex", justifyContent: "flex-start" }}>
                    <div style={{ maxWidth: "85%", padding: "10px 14px", borderRadius: 12, background: "#f6ffed", border: "1px solid #b7eb8f", boxShadow: "0 1px 2px rgba(0,0,0,0.04)" }}>
                      <div style={{ marginBottom: 4, display: "flex", alignItems: "center", gap: 6 }}>
                        <RobotOutlined style={{ color: "#52c41a" }} /><Text strong style={{ fontSize: 12, color: "#52c41a" }}>AI 回复</Text>
                      </div>
                      <CollapsibleMessage>
                        <div style={{ whiteSpace: "pre-wrap", wordBreak: "break-word", fontSize: 13, lineHeight: 1.7, color: "#333", contentVisibility: "auto" }}>
                          {data.response_text}
                        </div>
                      </CollapsibleMessage>
                    </div>
                  </div>
                )}
              </div>
            </Card>
          </>
        );
      })()}

      {/* 错误信息单独展示 */}
      {data.error_msg && (!data.messages || (data.messages as any)?.length === 0) && (
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
