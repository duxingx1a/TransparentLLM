"use client";

import React, { useState, useRef, useEffect, useCallback } from "react";
import {
  Select, Input, Button, Space, Typography, Tag, Spin, message,
  Tabs, Slider, InputNumber, Tooltip, Divider, Card,
} from "antd";
import {
  SendOutlined, ClearOutlined, RobotOutlined, UserOutlined,
  InfoCircleOutlined, CodeOutlined,
  CheckOutlined, CopyOutlined, DownOutlined, RightOutlined, BulbOutlined,
  SwapOutlined, PlusOutlined, DeleteOutlined,
} from "@ant-design/icons";
import { useQuery } from "@tanstack/react-query";
import { modelsApi, playgroundApi } from "@/lib/api";
import { ModelIcon } from "@/lib/icons";
import type { CompareResult } from "./types";

const { Title, Text } = Typography;
const { TextArea } = Input;

/** 格式化数字 */
function formatNumber(n: number): string {
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)}B`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

/** 格式化时长 */
function formatDuration(ms: number): string {
  if (ms >= 1000) return `${(ms / 1000).toFixed(2)}s`;
  return `${ms}ms`;
}

/** 获取认证 Token */
function getAccessToken(): string {
  if (typeof window === "undefined") return "";
  return localStorage.getItem("master_key") || "";
}

// ═══════════════════════════════════════════
// 响应指标组件（简化版，参考 Litellm）
// ═══════════════════════════════════════════
interface ResponseMetricsProps {
  timeToFirstToken?: number;
  totalLatency?: number;
  usage?: {
    completionTokens?: number;
    promptTokens?: number;
    totalTokens?: number;
    reasoningTokens?: number;
    cost?: number;
  };
  toolName?: string;
}

function ResponseMetrics({ timeToFirstToken, totalLatency, usage, toolName }: ResponseMetricsProps) {
  if (!timeToFirstToken && !totalLatency && !usage) return null;

  return (
    <div className="response-metrics mt-2 pt-2 border-t border-gray-100 text-xs text-gray-500 flex flex-wrap gap-3">
      {timeToFirstToken !== undefined && (
        <Tooltip title="首个 Token 耗时">
          <div className="flex items-center">
            <span className="mr-1">⏱</span>
            <span>首字耗时: {(timeToFirstToken / 1000).toFixed(2)}s</span>
          </div>
        </Tooltip>
      )}
      {totalLatency !== undefined && (
        <Tooltip title="总耗时">
          <div className="flex items-center">
            <span className="mr-1">⏱</span>
            <span>总耗时: {(totalLatency / 1000).toFixed(2)}s</span>
          </div>
        </Tooltip>
      )}
      {usage?.promptTokens !== undefined && (
        <Tooltip title="输入 Token 数">
          <div className="flex items-center">
            <span className="mr-1">📥</span>
            <span>输入: {usage.promptTokens}</span>
          </div>
        </Tooltip>
      )}
      {usage?.completionTokens !== undefined && (
        <Tooltip title="输出 Token 数">
          <div className="flex items-center">
            <span className="mr-1">📤</span>
            <span>输出: {usage.completionTokens}</span>
          </div>
        </Tooltip>
      )}
      {usage?.reasoningTokens !== undefined && (
        <Tooltip title="推理 Token 数">
          <div className="flex items-center">
            <span className="mr-1">💡</span>
            <span>推理: {usage.reasoningTokens}</span>
          </div>
        </Tooltip>
      )}
      {usage?.totalTokens !== undefined && (
        <Tooltip title="总 Token 数">
          <div className="flex items-center">
            <span className="mr-1">🔢</span>
            <span>总计: {usage.totalTokens}</span>
          </div>
        </Tooltip>
      )}
      {usage?.cost !== undefined && (
        <Tooltip title="费用">
          <div className="flex items-center">
            <span className="mr-1">💰</span>
            <span>${usage.cost.toFixed(6)}</span>
          </div>
        </Tooltip>
      )}
      {toolName && (
        <Tooltip title="使用的工具">
          <div className="flex items-center">
            <span className="mr-1">🔧</span>
            <span>工具: {toolName}</span>
          </div>
        </Tooltip>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════
// 推理内容组件（简化版，参考 Litellm）
// ═══════════════════════════════════════════
function ReasoningContent({ reasoningContent }: { reasoningContent: string }) {
  const [isExpanded, setIsExpanded] = useState(true);

  if (!reasoningContent) return null;

  return (
    <div className="reasoning-content mt-1 mb-2">
      <Button
        type="text"
        className="flex items-center text-xs text-gray-500 hover:text-gray-700"
        onClick={() => setIsExpanded(!isExpanded)}
        icon={<BulbOutlined />}
      >
        {isExpanded ? "隐藏推理过程" : "显示推理过程"}
        {isExpanded ? <DownOutlined className="ml-1" /> : <RightOutlined className="ml-1" />}
      </Button>

      {isExpanded && (
        <div className="mt-2 p-3 bg-gray-50 border border-gray-200 rounded-md text-sm text-gray-700 whitespace-pre-wrap">
          {reasoningContent}
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════
// 代码片段组件（简化版，参考 Litellm）
// ═══════════════════════════════════════════
function CodeSnippets({ inputMessage, chatHistory, selectedModel }: {
  inputMessage: string;
  chatHistory: Array<{ role: string; content: string }>;
  selectedModel?: string;
}) {
  const [selectedSdk, setSelectedSdk] = useState<"python" | "curl" | "javascript">("python");
  const [copied, setCopied] = useState(false);

  const messages = chatHistory
    .filter((m) => m.role === "user" || m.role === "assistant")
    .map(({ role, content }) => ({ role, content }));

  const generateCode = (sdk: string): string => {
    const modelName = selectedModel || "你的模型名称";
    const clientInit = sdk === "python"
      ? `import openai\n\nclient = openai.OpenAI(\n    api_key="你的 API Key",\n    base_url="http://你的主机/v1"\n)`
      : sdk === "javascript"
      ? `import OpenAI from "openai";\n\nconst client = new OpenAI({\n  apiKey: "你的 API Key",\n  baseURL: "http://你的主机/v1",\n  dangerouslyAllowBrowser: true,\n});`
      : "";

    const msgs = messages.length > 0
      ? messages.map((m) => ({ role: m.role, content: m.content }))
      : [{ role: "user", content: inputMessage || "你的提示词" }];

    if (sdk === "python") {
      return `${clientInit}\n\nresponse = client.chat.completions.create(\n    model="${modelName}",\n    messages=${JSON.stringify(msgs, null, 4)}\n)\n\nprint(response)`;
    }
    if (sdk === "curl") {
      return `curl -X POST "http://你的主机/v1/chat/completions" \\\n  -H "Content-Type: application/json" \\\n  -H "Authorization: Bearer 你的 API Key" \\\n  -d '${JSON.stringify({ model: modelName, messages: msgs }, null, 2)}'`;
    }
    // javascript
    return `${clientInit}\n\nconst response = await client.chat.completions.create({\n  model: "${modelName}",\n  messages: ${JSON.stringify(msgs, null, 2)},\n});\n\nconsole.log(response.choices[0].message.content);`;
  };

  const currentCode = generateCode(selectedSdk);

  const handleCopy = () => {
    navigator.clipboard.writeText(currentCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2 bg-gray-50 border-b border-gray-200">
        <Space size={4}>
          <Text className="text-xs font-medium text-gray-600">代码片段</Text>
        </Space>
        <Space size={8}>
          {(["python", "curl", "javascript"] as const).map((sdk) => (
            <Button key={sdk} type="text" size="small"
              className={`text-xs ${selectedSdk === sdk ? "text-blue-600 font-medium" : "text-gray-500"}`}
              onClick={() => setSelectedSdk(sdk)}>
              {sdk === "javascript" ? "JS" : sdk.charAt(0).toUpperCase() + sdk.slice(1)}
            </Button>
          ))}
          <Button type="text" size="small" icon={copied ? <CheckOutlined /> : <CopyOutlined />}
            onClick={handleCopy} className="text-gray-500" />
        </Space>
      </div>
      <pre className="p-3 text-xs text-gray-700 bg-white overflow-auto max-h-64 m-0 font-mono leading-relaxed">
        {currentCode}
      </pre>
    </div>
  );
}

// ═══════════════════════════════════════════
// Chat 视图（简化版，参考 Litellm）
// ═══════════════════════════════════════════
function ChatView() {
  const { data } = useQuery<{ models: any[] }>({ queryKey: ["models"], queryFn: modelsApi.list });
  const models = data?.models || [];

  const [selectedModel, setSelectedModel] = useState("");
  const [systemPrompt, setSystemPrompt] = useState("");
  const [inputMessage, setInputMessage] = useState("");
  const [chatHistory, setChatHistory] = useState<Array<{
    role: string;
    content: string;
    reasoningContent?: string;
    model?: string;
    timeToFirstToken?: number;
    totalLatency?: number;
    usage?: { completionTokens?: number; promptTokens?: number; totalTokens?: number; reasoningTokens?: number; cost?: number };
    toolName?: string;
  }>>([]);
  const [loading, setLoading] = useState(false);
  const [temperature, setTemperature] = useState(0.7);
  const [maxTokens, setMaxTokens] = useState(2048);
  const [streaming, setStreaming] = useState(true);
  const [showCode, setShowCode] = useState(false);

  // 当前回复状态
  const [currentContent, setCurrentContent] = useState("");
  const [currentReasoning, setCurrentReasoning] = useState("");
  const [currentTTFT, setCurrentTTFT] = useState<number | undefined>();
  const [currentLatency, setCurrentLatency] = useState<number | undefined>();
  const [currentUsage, setCurrentUsage] = useState<ResponseMetricsProps["usage"]>();

  const endRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const usageRef = useRef<ResponseMetricsProps["usage"]>();

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatHistory, currentContent]);

  useEffect(() => {
    return () => { abortRef.current?.abort(); };
  }, []);

  // 默认选第一个模型
  const modelsLoadedRef = React.useRef(false);
  useEffect(() => {
    if (models.length > 0 && !modelsLoadedRef.current) {
      modelsLoadedRef.current = true;
      setSelectedModel(models[0].id);
    }
  }, [models]);

  const sendMessage = useCallback(async () => {
    if (!selectedModel || !inputMessage.trim() || loading) return;
    const selectedModelObj = models.find((m: any) => m.id === selectedModel);
    const modelName = selectedModelObj ? `${selectedModelObj.provider}-${selectedModelObj.model_name}` : selectedModel;
    const accessToken = getAccessToken();

    const userMsg = { role: "user", content: inputMessage.trim() };
    const newHistory = [...chatHistory, userMsg];
    setChatHistory(newHistory);
    setInputMessage("");
    setLoading(true);

    const apiMessages = [
      ...(systemPrompt.trim() ? [{ role: "system", content: systemPrompt.trim() }] : []),
      ...newHistory.map((m) => ({ role: m.role, content: m.content })),
    ];

    setCurrentContent("");
    setCurrentReasoning("");
    setCurrentTTFT(undefined);
    setCurrentLatency(undefined);
    setCurrentUsage(undefined);

    if (streaming) {
      let content = "";
      let reasoningContent = "";

      try {
        abortRef.current = new AbortController();
        const startTime = Date.now();
        let firstTokenReceived = false;

        // 复用 chatStream 的异步生成器逻辑，逐 token 渲染
        const stream = playgroundApi.chatStream({
          model_name: modelName,
          messages: apiMessages,
          stream: true,
          temperature,
          max_tokens: maxTokens,
        }, abortRef.current.signal);

        for await (const chunk of stream) {
          if (chunk.done) break;

          if (chunk.content) {
            content += chunk.content;
            setCurrentContent(content);
          }
          if (chunk.reasoning_content) {
            reasoningContent += chunk.reasoning_content;
            setCurrentReasoning(reasoningContent);
          }
          if (chunk.reasoning) {
            reasoningContent += chunk.reasoning;
            setCurrentReasoning(reasoningContent);
          }

          if (!firstTokenReceived && (chunk.content || chunk.reasoning_content || chunk.reasoning)) {
            firstTokenReceived = true;
            setCurrentTTFT(Date.now() - startTime);
          }

          if (chunk.usage) {
            const u = {
              completionTokens: chunk.usage.completion_tokens,
              promptTokens: chunk.usage.prompt_tokens,
              totalTokens: chunk.usage.total_tokens,
              reasoningTokens: chunk.usage.completion_tokens_details?.reasoning_tokens,
              cost: chunk.usage.cost ? parseFloat(chunk.usage.cost) : undefined,
            };
            setCurrentUsage(u);
            usageRef.current = u;
          }
        }

        const totalLatency = Date.now() - startTime;
        setCurrentLatency(totalLatency);

        // 使用流式过程中收集的真实 usage，避免用 content.length 假算
        setChatHistory((prev) => [...prev, {
          role: "assistant",
          content,
          reasoningContent: reasoningContent || undefined,
          model: modelName,
          timeToFirstToken: firstTokenReceived ? undefined : undefined,
          totalLatency,
          usage: usageRef.current || (currentUsage ? {
            completionTokens: currentUsage?.completionTokens ?? undefined,
            promptTokens: currentUsage?.promptTokens ?? undefined,
            totalTokens: currentUsage?.totalTokens ?? undefined,
            reasoningTokens: currentUsage?.reasoningTokens ?? undefined,
            cost: currentUsage?.cost ?? undefined,
          } : undefined),
        }]);
      } catch (e: any) {
        if (e.name === "AbortError") return;
        message.error(e.message || "请求失败");
        setChatHistory((prev) => [...prev, { role: "assistant", content: `❌ 错误: ${e.message}`, model: modelName }]);
      } finally {
        setLoading(false);
        abortRef.current = null;
        usageRef.current = undefined;
        setCurrentContent("");
        setCurrentReasoning("");
        setCurrentTTFT(undefined);
        setCurrentLatency(undefined);
        setCurrentUsage(undefined);
      }
    } else {
      try {
        const startTime = Date.now();
        const r = await playgroundApi.chat({
          model_name: modelName,
          messages: apiMessages,
          stream: false,
          temperature,
          max_tokens: maxTokens,
        });
        const latency = Date.now() - startTime;
        setChatHistory((prev) => [...prev, {
          role: "assistant",
          content: r.content || "(空响应)",
          model: modelName,
          totalLatency: r.duration_ms || latency,
          usage: r.usage ? {
            promptTokens: r.usage.prompt_tokens,
            completionTokens: r.usage.completion_tokens,
            totalTokens: r.usage.total_tokens,
          } : undefined,
        }]);
      } catch (e: any) {
        message.error(e.message || "请求失败");
      } finally {
        setLoading(false);
      }
    }
  }, [selectedModel, inputMessage, loading, chatHistory, systemPrompt, temperature, maxTokens, streaming, models]);

  const handleStop = () => {
    abortRef.current?.abort();
    setLoading(false);
  };

  const handleClear = () => {
    setChatHistory([]);
    setCurrentContent("");
    setCurrentReasoning("");
    setCurrentTTFT(undefined);
    setCurrentLatency(undefined);
    setCurrentUsage(undefined);
    abortRef.current?.abort();
  };

  const modelOpts = models.map((m: any) => ({
    label: <Space><ModelIcon modelName={m.model_name} size={18} /><Tag className="ml-1">{m.provider}</Tag></Space>,
    value: m.id,
  }));

  const selectedModelName = models.find((m: any) => m.id === selectedModel)?.model_name || "";

  /** 渲染消息气泡（照抄 Litellm 消息样式） */
  const renderMessage = (msg: typeof chatHistory[0], index: number) => {
    const isUser = msg.role === "user";
    return (
      <div key={index} className={`mb-4 ${isUser ? "flex justify-end" : "flex justify-start"}`}>
        <div
          className="rounded-lg shadow-xs p-3.5 px-4"
          style={{
            backgroundColor: isUser ? "#f0f8ff" : "#ffffff",
            border: isUser ? "1px solid #e6f0fa" : "1px solid #f0f0f0",
            textAlign: "left",
            maxWidth: "85%",
            width: "fit-content",
          }}
        >
          {/* Header: role icon + name + model badge */}
          <div className="flex items-center gap-2 mb-1.5">
            <div
              className="flex items-center justify-center w-6 h-6 rounded-full mr-1"
              style={{
                backgroundColor: isUser ? "#e6f0fa" : "#f5f5f5",
              }}
            >
              {isUser ? (
                <UserOutlined style={{ fontSize: "12px", color: "#2563eb" }} />
              ) : (
                <RobotOutlined style={{ fontSize: "12px", color: "#4b5563" }} />
              )}
            </div>
            <strong className="text-sm capitalize">{msg.role}</strong>
            {msg.role === "assistant" && msg.model && (
              <span className="text-xs px-2 py-0.5 rounded-sm bg-gray-100 text-gray-600 font-normal">
                {msg.model}
              </span>
            )}
          </div>
          {/* 推理内容 */}
          {msg.reasoningContent && <ReasoningContent reasoningContent={msg.reasoningContent} />}
          {/* 消息内容 */}
          <div className="whitespace-pre-wrap wrap-break-word max-w-full message-content" style={{ wordWrap: "break-word", overflowWrap: "break-word", wordBreak: "break-word", hyphens: "auto" }}>
            {typeof msg.content === "string" ? msg.content : ""}
          </div>
          {/* 响应指标 */}
          {!isUser && (
            <ResponseMetrics
              timeToFirstToken={msg.timeToFirstToken}
              totalLatency={msg.totalLatency}
              usage={msg.usage}
              toolName={msg.toolName}
            />
          )}
        </div>
      </div>
    );
  };

  /** 渲染正在生成的回复（照抄 Litellm 样式） */
  const renderStreamingReply = () => {
    if (!loading || (!currentContent && !currentReasoning)) return null;
    const modelName = models.find((m: any) => m.id === selectedModel)?.model_name || selectedModel;
    return (
      <div className="mb-4 flex justify-start">
        <div
          className="rounded-lg shadow-xs p-3.5 px-4"
          style={{
            backgroundColor: "#ffffff",
            border: "1px solid #f0f0f0",
            textAlign: "left",
            maxWidth: "85%",
            width: "fit-content",
          }}
        >
          {/* Header: role icon + name + model badge */}
          <div className="flex items-center gap-2 mb-1.5">
            <div
              className="flex items-center justify-center w-6 h-6 rounded-full mr-1"
              style={{ backgroundColor: "#f5f5f5" }}
            >
              <RobotOutlined style={{ fontSize: "12px", color: "#4b5563" }} />
            </div>
            <strong className="text-sm capitalize">assistant</strong>
            {modelName && (
              <span className="text-xs px-2 py-0.5 rounded-sm bg-gray-100 text-gray-600 font-normal">
                {modelName}
              </span>
            )}
          </div>
          {currentReasoning && <ReasoningContent reasoningContent={currentReasoning} />}
          <div className="whitespace-pre-wrap wrap-break-word max-w-full message-content" style={{ wordWrap: "break-word", overflowWrap: "break-word", wordBreak: "break-word", hyphens: "auto" }}>
            {currentContent}
            <Spin size="small" className="ml-1" />
          </div>
          <ResponseMetrics
            timeToFirstToken={currentTTFT}
            totalLatency={currentLatency}
            usage={currentUsage}
          />
        </div>
      </div>
    );
  };

  return (
    <div className="flex gap-6" style={{ height: "calc(100vh - 200px)", minHeight: 500 }}>
      {/* 左侧：聊天区域 */}
      <div className="flex-1 flex flex-col min-w-0">
        <div className="flex-1 overflow-auto pr-2">
          {chatHistory.length === 0 && !loading ? (
            <div className="flex flex-col items-center justify-center h-full text-center">
              <RobotOutlined style={{ fontSize: "48px", marginBottom: "16px", color: "#9CA3AF" }} />
              <Title level={5} className="!mb-2">开始对话</Title>
              <Text type="secondary" className="text-sm">选择一个模型，输入消息开始测试</Text>
            </div>
          ) : (
            <div>
              {chatHistory.map((msg, i) => renderMessage(msg, i))}
              {renderStreamingReply()}
            </div>
          )}
          <div ref={endRef} />
        </div>

        {/* 输入区域（照抄 Litellm 输入样式） */}
        <div className="mt-4 pt-4 border-t border-gray-200">
          <div className="flex items-center gap-2">
            <div className="flex items-center flex-1 bg-white border border-gray-300 rounded-xl px-3 py-1 min-h-[44px]">
              <TextArea
                placeholder="输入消息… (Enter 发送, Shift+Enter 换行)"
                value={inputMessage}
                onChange={(e) => setInputMessage(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); }
                }}
                disabled={loading}
                className="flex-1"
                autoSize={{ minRows: 1, maxRows: 4 }}
                style={{ resize: "none", border: "none", boxShadow: "none", background: "transparent", padding: "4px 0", fontSize: "14px", lineHeight: "20px" }}
              />
            </div>
            <Button
              type="primary"
              shape="circle"
              icon={<SendOutlined style={{ fontSize: "14px" }} />}
              onClick={sendMessage}
              disabled={loading || !selectedModel || !inputMessage.trim()}
              className="shrink-0 w-8 h-8 min-w-8 p-0 rounded-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 border-none text-white disabled:text-gray-500 flex items-center justify-center"
            />
          </div>
          <div className="flex items-center justify-between mt-2">
            <Space size={12}>
              <Button type="text" size="small" icon={<ClearOutlined />} onClick={handleClear}>
                清空对话
              </Button>
              {chatHistory.length > 0 && (
                <Button type="text" size="small" icon={<CodeOutlined />}
                  onClick={() => setShowCode(!showCode)}>
                  {showCode ? "隐藏代码" : "查看代码"}
                </Button>
              )}
            </Space>
            <Text type="secondary" className="text-[11px]">Enter 发送 · Shift+Enter 换行</Text>
          </div>
          {showCode && chatHistory.length > 0 && (
            <div className="mt-3">
              <CodeSnippets
                inputMessage={inputMessage}
                chatHistory={chatHistory}
                selectedModel={selectedModelName}
              />
            </div>
          )}
        </div>
      </div>

      {/* 右侧：参数面板（简化版） */}
      <div className="w-72 border-l border-gray-200 pl-6 flex-shrink-0 flex flex-col">
        {/* 模型选择 */}
        <div className="mb-4">
          <Text className="text-xs font-semibold text-gray-400 uppercase tracking-wider block mb-2">模型</Text>
          <Select
            value={selectedModel || undefined}
            onChange={setSelectedModel}
            style={{ width: "100%" }}
            options={modelOpts}
            placeholder="选择模型"
            size="large"
            showSearch
            filterOption={(input, option) =>
              (option?.label as React.ReactNode)?.toString().toLowerCase().includes(input.toLowerCase()) ?? false
            }
          />
        </div>

        <Divider className="!my-3" />

        {/* 系统提示词 */}
        <div className="mb-4">
          <Text className="text-xs font-semibold text-gray-400 uppercase tracking-wider block mb-2">系统提示词</Text>
          <Input.TextArea
            value={systemPrompt}
            onChange={(e) => setSystemPrompt(e.target.value)}
            placeholder="可选的系统提示词…"
            rows={3}
            className="!text-xs"
          />
        </div>

        <Divider className="!my-3" />

        {/* 参数设置 */}
        <Text className="text-xs font-semibold text-gray-400 uppercase tracking-wider block mb-3">参数</Text>
        <div className="space-y-4">
          <div>
            <div className="flex items-center justify-between mb-1">
              <Space size={4}>
                <Text className="text-xs text-gray-500">温度</Text>
                <Tooltip title="值越低输出越确定，值越高越随机"><InfoCircleOutlined className="text-gray-300 text-xs" /></Tooltip>
              </Space>
              <Text className="text-xs text-gray-400">{temperature}</Text>
            </div>
            <Slider min={0} max={2} step={0.1} value={temperature} onChange={setTemperature} tooltip={{ formatter: null }} />
          </div>
          <div>
            <div className="flex items-center justify-between mb-1">
              <Space size={4}>
                <Text className="text-xs text-gray-500">最大 Token 数</Text>
                <Tooltip title="最大输出长度"><InfoCircleOutlined className="text-gray-300 text-xs" /></Tooltip>
              </Space>
              <InputNumber min={1} max={128000} step={100} value={maxTokens}
                onChange={(v) => setMaxTokens(v || 2048)} size="small" variant="borderless"
                className="!w-14 text-xs text-right" />
            </div>
            <Slider min={64} max={32768} step={64} value={maxTokens} onChange={setMaxTokens} tooltip={{ formatter: null }} />
          </div>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════
// 对比视图（照抄 Litellm CompareUI 设计）
// ═══════════════════════════════════════════
interface ComparisonInstance {
  id: string;
  model: string;
  messages: Array<{ role: string; content: string; reasoningContent?: string }>;
  isLoading: boolean;
  temperature: number;
  maxTokens: number;
}

function CompareView() {
  const { data } = useQuery<{ models: any[] }>({ queryKey: ["models"], queryFn: modelsApi.list });
  const models = data?.models || [];

  const [comparisons, setComparisons] = useState<ComparisonInstance[]>([
    {
      id: "1",
      model: "",
      messages: [],
      isLoading: false,
      temperature: 1,
      maxTokens: 2048,
    },
    {
      id: "2",
      model: "",
      messages: [],
      isLoading: false,
      temperature: 1,
      maxTokens: 2048,
    },
  ]);

  const [inputValue, setInputValue] = useState("");

  // 对比视图的模型选项：只显示图标 + 提供商 Tag（图标已带模型名）
  const compareModelOpts = React.useMemo(() => models.map((m: any) => ({
    label: <Space><ModelIcon modelName={m.model_name} size={18} /><Tag className="ml-1">{m.provider}</Tag></Space>,
    value: m.id,
  })), [models]);

  // 首次加载时设置默认模型（只执行一次）
  const modelsLoadedRef = React.useRef(false);
  useEffect(() => {
    if (compareModelOpts.length === 0 || modelsLoadedRef.current) return;
    modelsLoadedRef.current = true;
    setComparisons((prev) =>
      prev.map((comparison, index) => ({
        ...comparison,
        model: comparison.model || compareModelOpts[index % compareModelOpts.length]?.value || "",
      }))
    );
  }, [compareModelOpts]);

  const maxComparisons = 3;

  const addComparison = () => {
    if (comparisons.length >= maxComparisons) return;
    const fallbackModel = compareModelOpts[comparisons.length % (compareModelOpts.length || 1)]?.value || "";
    setComparisons((prev) => [
      ...prev,
      {
        id: Date.now().toString(),
        model: fallbackModel,
        messages: [],
        isLoading: false,
        temperature: 1,
        maxTokens: 2048,
      },
    ]);
  };

  const removeComparison = (id: string) => {
    if (comparisons.length > 1) {
      setComparisons((prev) => prev.filter((c) => c.id !== id));
    }
  };

  const updateComparison = (id: string, updates: Partial<ComparisonInstance>) => {
    setComparisons((prev) =>
      prev.map((c) => (c.id === id ? { ...c, ...updates } : c))
    );
  };

  const clearAllChats = () => {
    setComparisons((prev) =>
      prev.map((c) => ({ ...c, messages: [], isLoading: false }))
    );
    setInputValue("");
  };

  const handleSendMessage = async () => {
    const trimmed = inputValue.trim();
    if (!trimmed) return;

    const targetComparisons = comparisons.filter((c) => c.model);
    if (targetComparisons.length === 0) return;

    // 添加用户消息到所有对比实例
    setComparisons((prev) =>
      prev.map((c) => ({
        ...c,
        messages: [...c.messages, { role: "user", content: trimmed }],
        isLoading: true,
      }))
    );
    setInputValue("");

    // 并行发送所有对比请求
    await Promise.all(targetComparisons.map(async (comparison) => {
      try {
        // 根据模型ID查找模型名称
        const modelObj = models.find((m: any) => m.id === comparison.model);
        if (!modelObj) {
          updateComparison(comparison.id, {
            messages: [...comparison.messages, { role: "assistant", content: "❌ 未找到模型，请重新选择" }],
            isLoading: false,
          });
          return;
        }
        const modelName = `${modelObj.provider}-${modelObj.model_name}`;
        // 手动添加用户消息，因为 setComparisons 是异步的
        const messagesWithUser = [...comparison.messages, { role: "user", content: trimmed }];

        // 流式模式
        let fullContent = "";
        let fullReasoning = "";
        const stream = playgroundApi.chatStream({
          model_name: modelName,
          messages: messagesWithUser,
          stream: true,
          temperature: comparison.temperature,
          max_tokens: comparison.maxTokens,
        });
        for await (const chunk of stream) {
          if (chunk.done) break;
          if (chunk.content) fullContent += chunk.content;
          if (chunk.reasoning_content) fullReasoning += chunk.reasoning_content;
          if ((chunk as any).reasoning) fullReasoning += (chunk as any).reasoning;
          // 实时更新：分别存储 thinking 和 reply
          updateComparison(comparison.id, {
            messages: [
              ...comparison.messages,
              { role: "user", content: trimmed },
              { role: "assistant", content: fullContent || "", reasoningContent: fullReasoning || undefined },
            ],
            isLoading: false,
          });
        }
        // 最终更新
        updateComparison(comparison.id, {
          messages: [
            ...comparison.messages,
            { role: "user", content: trimmed },
            { role: "assistant", content: fullContent || "(思考中...)", reasoningContent: fullReasoning || undefined },
          ],
        });
      } catch (e: any) {
        // 正确处理错误对象
        let errorMessage = "未知错误";
        if (e instanceof Error) {
          errorMessage = e.message;
        } else if (typeof e === "string") {
          errorMessage = e;
        } else if (typeof e === "object" && e !== null) {
          errorMessage = e.message || e.error || JSON.stringify(e);
        }
        // 尝试解析 JSON 格式的错误消息
        try {
          const parsed = JSON.parse(errorMessage);
          if (parsed.error) errorMessage = typeof parsed.error === "string" ? parsed.error : parsed.error.message || JSON.stringify(parsed.error);
          else if (parsed.message) errorMessage = parsed.message;
        } catch { /* 不是 JSON，保持原样 */ }
        
        updateComparison(comparison.id, {
          messages: [
            ...comparison.messages,
            { role: "assistant", content: `❌ 请求失败: ${errorMessage}` },
          ],
          isLoading: false,
        });
      }
    }));
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      handleSendMessage();
    }
  };

  const hasMessages = comparisons.some((c) => c.messages.length > 0);
  const isAnyLoading = comparisons.some((c) => c.isLoading);

  return (
    <div className="w-full h-full p-4 bg-white">
      <div className="rounded-2xl border border-gray-200 bg-white shadow-xs min-h-[calc(100vh-160px)] flex flex-col">
        {/* 顶部工具栏 */}
        <div className="border-b px-4 py-2">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-gray-600">对比设置</span>
            </div>
            <div className="flex items-center gap-3">
              <Button onClick={clearAllChats} disabled={!hasMessages} icon={<ClearOutlined />}>
                清空所有对话
              </Button>
              <Tooltip title={comparisons.length >= maxComparisons ? "最多同时对比3个模型" : "添加对比实例"}>
                <Button onClick={addComparison} disabled={comparisons.length >= maxComparisons} icon={<PlusOutlined />}>
                  添加对比
                </Button>
              </Tooltip>
            </div>
          </div>
        </div>

        {/* 对比面板区域 */}
        <div
          className="grid flex-1 min-h-0 auto-rows-fr"
          style={{ gridTemplateColumns: `repeat(${comparisons.length}, minmax(0, 1fr))` }}
        >
          {comparisons.map((comparison) => (
            <div key={comparison.id} className="flex flex-col border-r border-gray-200 last:border-r-0">
              {/* 对比实例头部 */}
              <div className="px-3 pt-2 pb-1 border-b border-gray-200 flex items-center justify-between gap-2">
                <Select
                  value={comparison.model || undefined}
                  onChange={(value) => updateComparison(comparison.id, { model: value })}
                  placeholder="选择模型"
                  style={{ width: "100%" }}
                  showSearch
                  size="small"
                  filterOption={(input, option) =>
                    (option?.label as React.ReactNode)?.toString().toLowerCase().includes(input.toLowerCase()) ?? false
                  }
                  options={compareModelOpts}
                />
                {comparisons.length > 1 && (
                  <Button
                    type="text"
                    size="small"
                    icon={<DeleteOutlined />}
                    onClick={() => removeComparison(comparison.id)}
                    danger
                  />
                )}
              </div>

              {/* 对话消息区域 */}
              <div className="flex-1 overflow-auto p-3">
                {comparison.messages.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-gray-400">
                    <RobotOutlined style={{ fontSize: "32px", marginBottom: "8px" }} />
                    <Text className="text-sm">选择模型，输入消息开始对比</Text>
                  </div>
                ) : (
                  comparison.messages.map((msg, idx) => (
                    <div key={idx} className={`mb-3 ${msg.role === "user" ? "text-right" : "text-left"}`}>
                      <div
                        className="inline-block max-w-[90%] rounded-lg shadow-xs p-3 px-4"
                        style={{
                          backgroundColor: msg.role === "user" ? "#f0f8ff" : "#ffffff",
                          border: msg.role === "user" ? "1px solid #e6f0fa" : "1px solid #f0f0f0",
                          textAlign: "left",
                        }}
                      >
                        <div className="flex items-center gap-2 mb-1.5">
                          <div
                            className="flex items-center justify-center w-5 h-5 rounded-full"
                            style={{ backgroundColor: msg.role === "user" ? "#e6f0fa" : "#f5f5f5" }}
                          >
                            {msg.role === "user" ? (
                              <UserOutlined style={{ fontSize: "10px", color: "#2563eb" }} />
                            ) : (
                              <RobotOutlined style={{ fontSize: "10px", color: "#4b5563" }} />
                            )}
                          </div>
                          <strong className="text-xs capitalize">{msg.role === "user" ? "用户" : "助手"}</strong>
                        </div>
                        {msg.reasoningContent && <ReasoningContent reasoningContent={msg.reasoningContent} />}
                        <div className="whitespace-pre-wrap wrap-break-word text-sm" style={{ wordBreak: "break-word" }}>
                          {msg.content}
                        </div>
                      </div>
                    </div>
                  ))
                )}
                {comparison.isLoading && (
                  <div className="text-center py-2">
                    <Spin size="small" />
                  </div>
                )}
              </div>

              {/* 对比实例参数 */}
              <div className="p-3 border-t border-gray-200">
                <div className="flex items-center gap-2 mb-2">
                  <Text className="text-xs text-gray-500 w-12">温度</Text>
                  <InputNumber
                    min={0} max={2} step={0.1}
                    value={comparison.temperature}
                    onChange={(v) => updateComparison(comparison.id, { temperature: v || 1 })}
                    size="small" className="!w-16"
                  />
                  <Text className="text-xs text-gray-500 w-16">最大Token</Text>
                  <InputNumber
                    min={1} max={128000} step={100}
                    value={comparison.maxTokens}
                    onChange={(v) => updateComparison(comparison.id, { maxTokens: v || 2048 })}
                    size="small" className="!w-20"
                  />
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* 底部输入区域 */}
        <div className="flex justify-center pb-4">
          <div className="w-full max-w-3xl px-4">
            <div className="border border-gray-200 shadow-lg rounded-xl bg-white p-4">
              {!hasMessages && !isAnyLoading && (
                <div className="flex items-center gap-2 mb-3 overflow-x-auto">
                  {["写一首诗", "解释量子计算", "起草一封礼貌的会面邮件"].map((prompt) => (
                    <button
                      key={prompt}
                      type="button"
                      onClick={() => setInputValue(prompt)}
                      className="shrink-0 rounded-full border border-gray-200 px-3 py-1 text-xs font-medium text-gray-600 transition-colors hover:bg-gray-100 cursor-pointer"
                    >
                      {prompt}
                    </button>
                  ))}
                </div>
              )}
              {isAnyLoading && (
                <div className="flex items-center gap-2 text-sm text-gray-500 mb-2">
                  <span className="h-2 w-2 rounded-full bg-blue-500 animate-pulse" />
                  正在生成回复...
                </div>
              )}
              <div className="flex items-center gap-2">
                <TextArea
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="输入消息进行对比… (Shift+Enter 换行)"
                  disabled={isAnyLoading}
                  className="flex-1"
                  autoSize={{ minRows: 1, maxRows: 4 }}
                  style={{ resize: "none", border: "none", boxShadow: "none", background: "transparent", padding: "4px 0", fontSize: "14px", lineHeight: "20px" }}
                />
                <Button
                  type="primary"
                  shape="circle"
                  icon={<SendOutlined style={{ fontSize: "14px" }} />}
                  onClick={handleSendMessage}
                  disabled={isAnyLoading || !inputValue.trim()}
                  className="shrink-0 w-8 h-8 min-w-8 p-0 rounded-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 border-none text-white disabled:text-gray-500 flex items-center justify-center"
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════
// 主页面
// ═══════════════════════════════════════════
export default function PlaygroundPage() {
  return (
    <div className="w-full p-6 overflow-x-hidden box-border">
      <h1 className="text-xl font-semibold mb-4">游戏场</h1>
      <Tabs
        defaultActiveKey="chat"
        style={{ marginTop: -8 }}
        items={[
          {
            key: "chat",
            label: <Space><SendOutlined />对话</Space>,
            children: <ChatView />,
          },
          {
            key: "compare",
            label: <Space><SwapOutlined />对比</Space>,
            children: <CompareView />,
          },
        ]}
      />
    </div>
  );
}