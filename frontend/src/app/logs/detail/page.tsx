"use client";

import React, { Suspense, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import {
  Card, Descriptions, Tag, Typography, Button, Spin, Empty,
} from "antd";
import {
  ArrowLeftOutlined, RobotOutlined, UserOutlined, SettingOutlined,
  CodeOutlined, EyeOutlined, ToolOutlined,
} from "@ant-design/icons";
import { useQuery } from "@tanstack/react-query";
import { logsApi } from "@/lib/api";
import type { RequestLogDetail } from "@/types";
import dayjs from "dayjs";

const { Title, Text } = Typography;

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}
function formatSpend(n: number): string {
  return `¥${n.toFixed(4)}`;
}

function JsonView({ data }: { data: any }) {
  const [expanded, setExpanded] = useState(false);
  const text = typeof data === "string" ? data : JSON.stringify(data, null, 2);
  const lines = text.split("\n");
  return (
    <div style={{ position: "relative" }}>
      <div onClick={() => setExpanded(!expanded)} style={{ position: "absolute", top: 4, right: 4, zIndex: 10, cursor: "pointer", padding: "2px 8px", borderRadius: 4, background: "rgba(0,0,0,0.06)", fontSize: 11, color: "#666" }}>
        {expanded ? "收起" : "展开全部"}
      </div>
      <pre style={{ margin: 0, padding: 12, borderRadius: 8, background: "#f6f8fa", fontSize: 12, lineHeight: 1.6, overflow: "auto", maxHeight: expanded ? 800 : 300, whiteSpace: "pre-wrap", wordBreak: "break-all", fontFamily: "monospace" }}>
        {expanded ? text : lines.slice(0, 30).join("\n") + (lines.length > 30 ? "\n\n... " : "")}
      </pre>
    </div>
  );
}

function MessageContent({ content }: { content: any }) {
  if (typeof content === "string") {
    return <div style={{ whiteSpace: "pre-wrap", wordBreak: "break-word", fontSize: 13, lineHeight: 1.7 }}>{content}</div>;
  }
  if (Array.isArray(content)) {
    return <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>{content.map((item: any, i: number) => {
      if (item.type === "text") return <div key={i} style={{ whiteSpace: "pre-wrap", fontSize: 13, lineHeight: 1.7 }}>{item.text}</div>;
      if (item.type === "image_url") return <div key={i} style={{ fontSize: 12, color: "#888" }}>📷 图片</div>;
      return <div key={i} style={{ fontSize: 12, color: "#888" }}>[{item.type || "unknown"}]</div>;
    })}</div>;
  }
  return <div style={{ fontSize: 13, lineHeight: 1.7 }}>{String(content || "")}</div>;
}

function LogDetailContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const id = searchParams.get("id") || "";
  const { data, isLoading, error } = useQuery<RequestLogDetail>({ queryKey: ["log-detail", id], queryFn: () => logsApi.detail(id), enabled: !!id });
  const [viewModes, setViewModes] = useState<Record<string, string>>({});
  const toggleView = (key: string) => setViewModes(prev => ({ ...prev, [key]: prev[key] === "json" ? "beauty" : "json" }));
  const getView = (key: string) => viewModes[key] || "beauty";

  if (!id) return <Empty description="缺少日志 ID" />;
  if (isLoading) return <div style={{ textAlign: "center", padding: 100 }}><Spin size="large" /></div>;
  if (error) return <Empty description={`加载失败：${error.message}`} />;
  if (!data) return <Empty description="日志不存在" />;

  let requestBody: any;
  try { requestBody = typeof data.messages === "string" ? JSON.parse(data.messages as unknown as string) : data.messages; } catch { requestBody = data.messages; }
  let responseBody: any;
  try { responseBody = typeof data.response === "string" ? JSON.parse(data.response as string) : data.response; } catch { responseBody = data.response; }

  const reqMessages = requestBody?.messages || (Array.isArray(requestBody) ? requestBody : []);
  const reqTools = requestBody?.tools || [];
  const reqSystem = requestBody?.system || "";
  const respMsg = responseBody?.choices?.[0]?.message || responseBody?.message || {};
  const thinking = respMsg.reasoning || respMsg.reasoning_content || "";
  const reply = respMsg.content || "";

  return (
    <div className="w-full p-6 box-border">
      <div style={{ position: "sticky", top: 0, zIndex: 100, background: "#fff", padding: "12px 0", marginBottom: 8, borderBottom: "1px solid #f0f0f0", display: "flex", alignItems: "center", gap: 12 }}>
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
        </Descriptions>
      </Card>

      {/* 请求卡片 */}
      {requestBody && (
        <Card title="请求" style={{ marginBottom: 16 }} extra={<Button size="small" type={getView("req") === "json" ? "primary" : "default"} onClick={() => toggleView("req")} icon={getView("req") === "json" ? <CodeOutlined /> : <EyeOutlined />}>{getView("req") === "json" ? "JSON" : "美化"}</Button>}>
          {getView("req") === "json" ? <JsonView data={requestBody} /> : (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {requestBody?.model && <Tag color="blue">模型: {requestBody.model}</Tag>}
                {requestBody?.stream !== undefined && <Tag>流式: {requestBody.stream ? "是" : "否"}</Tag>}
                {requestBody?.temperature !== undefined && <Tag>温度: {requestBody.temperature}</Tag>}
                {requestBody?.max_tokens !== undefined && <Tag>max_tokens: {requestBody.max_tokens}</Tag>}
                {reqSystem && <Tag color="purple">系统提示词</Tag>}
                {reqTools.length > 0 && <Tag color="cyan"><ToolOutlined /> 工具: {reqTools.length}</Tag>}
              </div>
              {reqSystem && <div style={{ background: "#f5f5f5", borderRadius: 8, padding: 10, fontSize: 12, lineHeight: 1.6, maxHeight: 200, overflow: "auto", whiteSpace: "pre-wrap", wordBreak: "break-word" }}><Text type="secondary" style={{ fontSize: 11 }}>System Prompt</Text><div style={{ marginTop: 4 }}>{reqSystem}</div></div>}
              {reqTools.length > 0 && <div style={{ background: "#f5f5f5", borderRadius: 8, padding: 10, fontSize: 12 }}><Text type="secondary" style={{ fontSize: 11 }}>Tools</Text><div style={{ marginTop: 4, display: "flex", gap: 6, flexWrap: "wrap" }}>{reqTools.map((t: any, i: number) => <Tag key={i} color="cyan">{t.function?.name || t.name || `tool_${i}`}</Tag>)}</div></div>}
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {reqMessages.map((msg: any, index: number) => {
                  const role = msg.role || "user";
                  const isUser = role === "user";
                  const isSystem = role === "system";
                  return (
                    <div key={index} style={{ display: "flex", justifyContent: isUser ? "flex-end" : "flex-start" }}>
                      <div style={{ maxWidth: "85%", padding: "10px 14px", borderRadius: 12, borderTopRightRadius: isUser ? 4 : 12, borderTopLeftRadius: isUser ? 12 : 4, background: isUser ? "#e6f4ff" : isSystem ? "#f5f5f5" : "#fafafa", border: `1px solid ${isUser ? "#91caff" : "#e6e6e6"}` }}>
                        <div style={{ marginBottom: 4, display: "flex", alignItems: "center", gap: 6, fontSize: 12 }}>
                          {isUser && <><UserOutlined style={{ color: "#1677ff" }} /><Text strong style={{ color: "#1677ff" }}>用户</Text></>}
                          {isSystem && <><SettingOutlined style={{ color: "#8c8c8c" }} /><Text strong style={{ color: "#8c8c8c" }}>System</Text></>}
                          {!isUser && !isSystem && <><RobotOutlined style={{ color: "#8c8c8c" }} /><Text strong style={{ color: "#8c8c8c" }}>{role}</Text></>}
                        </div>
                        <MessageContent content={msg.content} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </Card>
      )}

      {/* 响应卡片 */}
      {responseBody && (
        <Card title="响应" style={{ marginBottom: 16 }} extra={<Button size="small" type={getView("resp") === "json" ? "primary" : "default"} onClick={() => toggleView("resp")} icon={getView("resp") === "json" ? <CodeOutlined /> : <EyeOutlined />}>{getView("resp") === "json" ? "JSON" : "美化"}</Button>}>
          {getView("resp") === "json" ? <JsonView data={responseBody} /> : (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {thinking && <div><Text type="secondary" style={{ fontSize: 12 }}>思考过程</Text><div style={{ marginTop: 4, padding: 12, borderRadius: 8, background: "#fffbe6", border: "1px solid #ffe58f", fontSize: 13, lineHeight: 1.7, whiteSpace: "pre-wrap", wordBreak: "break-word", maxHeight: 400, overflow: "auto" }}>{thinking}</div></div>}
              {reply && <div><Text type="secondary" style={{ fontSize: 12 }}>AI 回复</Text><div style={{ marginTop: 4, padding: 12, borderRadius: 8, background: "#f6ffed", border: "1px solid #b7eb8f", fontSize: 13, lineHeight: 1.7, whiteSpace: "pre-wrap", wordBreak: "break-word", maxHeight: 600, overflow: "auto" }}>{reply}</div></div>}
              {!thinking && !reply && respMsg && <div><Text type="secondary" style={{ fontSize: 12 }}>原始消息</Text><div style={{ marginTop: 4, padding: 12, borderRadius: 8, background: "#fafafa", border: "1px solid #e6e6e6", fontSize: 13, lineHeight: 1.7, whiteSpace: "pre-wrap", wordBreak: "break-word", maxHeight: 600, overflow: "auto" }}>{JSON.stringify(respMsg, null, 2)}</div></div>}
              {responseBody?.usage && <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}><Tag>prompt: {responseBody.usage.prompt_tokens}</Tag><Tag>completion: {responseBody.usage.completion_tokens}</Tag><Tag>total: {responseBody.usage.total_tokens}</Tag></div>}
            </div>
          )}
        </Card>
      )}

      {data.error_msg && <Card title="错误信息" style={{ marginBottom: 16, borderColor: "#ff4d4f" }} headStyle={{ borderColor: "#ff4d4f" }}><Text type="danger" style={{ whiteSpace: "pre-wrap" }}>{data.error_msg}</Text></Card>}
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
