"use client";

import React, { useState, useRef, useEffect } from "react";
import { Card, Select, Input, Button, Space, Typography, Tag, Spin, Empty, message, Tabs, Slider, InputNumber, Checkbox, Tooltip, Divider, Row, Col } from "antd";
import { SendOutlined, ClearOutlined, RobotOutlined, UserOutlined, InfoCircleOutlined, SwapOutlined } from "@ant-design/icons";
import { useQuery } from "@tanstack/react-query";
import { modelsApi } from "@/lib/api";
import { ModelIcon } from "@/lib/icons";
import type { PlaygroundResponse } from "@/types";

const { Title, Text } = Typography;
const { TextArea } = Input;

interface ChatEntry { role: "user" | "assistant"; content: string; }
interface CompareResult { modelName: string; content: string; tokens: number; duration: number; error?: string; }

function ChatView() {
  const { data } = useQuery({ queryKey: ["models"], queryFn: modelsApi.list });
  const models = data?.models || [];
  const [model, setModel] = useState("");
  const [systemPrompt, setSystemPrompt] = useState("");
  const [msg, setMsg] = useState("");
  const [loading, setLoading] = useState(false);
  const [history, setHistory] = useState<ChatEntry[]>([]);
  const [metrics, setMetrics] = useState<PlaygroundResponse | null>(null);
  const [useParams, setUseParams] = useState(false);
  const [temp, setTemp] = useState(1.0);
  const [topP, setTopP] = useState(1.0);
  const [maxT, setMaxT] = useState(2048);
  const endRef = useRef<HTMLDivElement>(null);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [history]);

  const send = async () => {
    if (!model || !msg.trim()) return;
    setLoading(true); setMetrics(null);
    setHistory(p => [...p, { role: "user", content: msg }]);
    const text = msg; setMsg("");
    try {
      const r = await modelsApi.test(model, { message: text, stream: false });
      setHistory(p => [...p, { role: "assistant", content: r.content || "" }]);
      setMetrics(r);
    } catch (e: any) { message.error(e.message); }
    finally { setLoading(false); }
  };

  const opts = models.map(m => ({ label: <Space><ModelIcon modelName={m.model_name} size={18} />{m.model_name}</Space>, value: m.id }));

  const paramsPanel = (
    <div>
      <Checkbox checked={useParams} onChange={e => setUseParams(e.target.checked)} style={{ marginBottom: 14 }}>
        <Text style={{ fontSize: 13 }}>Advanced</Text>
      </Checkbox>
      <div style={{ opacity: useParams ? 1 : 0.4, pointerEvents: useParams ? "auto" : "none", transition: "opacity 0.2s" }}>
        <div style={{ marginBottom: 18 }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
            <Space size={4}><Text type="secondary" style={{ fontSize: 12 }}>Temperature</Text><Tooltip title="Lower = more deterministic"><InfoCircleOutlined style={{ fontSize: 11, color: "#d9d9d9" }} /></Tooltip></Space>
            <Text type="secondary" style={{ fontSize: 12 }}>{temp}</Text>
          </div>
          <Slider min={0} max={2} step={0.1} value={temp} onChange={setTemp} tooltip={{ formatter: null }} />
        </div>
        <div style={{ marginBottom: 18 }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
            <Space size={4}><Text type="secondary" style={{ fontSize: 12 }}>Top P</Text><Tooltip title="Nucleus sampling"><InfoCircleOutlined style={{ fontSize: 11, color: "#d9d9d9" }} /></Tooltip></Space>
            <Text type="secondary" style={{ fontSize: 12 }}>{topP}</Text>
          </div>
          <Slider min={0} max={1} step={0.05} value={topP} onChange={setTopP} tooltip={{ formatter: null }} />
        </div>
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
            <Space size={4}><Text type="secondary" style={{ fontSize: 12 }}>Max Tokens</Text><Tooltip title="Max output length"><InfoCircleOutlined style={{ fontSize: 11, color: "#d9d9d9" }} /></Tooltip></Space>
            <InputNumber min={1} max={128000} step={100} value={maxT} onChange={v => setMaxT(v || 2048)} size="small" bordered={false} style={{ width: 60 }} />
          </div>
          <Slider min={64} max={32768} step={64} value={maxT} onChange={setMaxT} tooltip={{ formatter: null }} />
        </div>
      </div>
    </div>
  );

  return (
    <div style={{ display: "flex", gap: 24, height: "calc(100vh - 220px)", minHeight: 480 }}>
      <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
        <div style={{ flex: 1, overflow: "auto" }}>
          {history.length === 0 ? (
            <div style={{ textAlign: "center", paddingTop: 80 }}>
              <RobotOutlined style={{ fontSize: 48, color: "#e8e8e8", marginBottom: 16 }} />
              <Text type="secondary">选择模型，输入消息开始对话</Text>
            </div>
          ) : history.map((e, i) => (
            <div key={i} style={{ marginBottom: 20 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4, justifyContent: e.role === "user" ? "flex-end" : "flex-start" }}>
                {e.role === "assistant" && <><RobotOutlined style={{ color: "#999", fontSize: 13 }} /><Text type="secondary" style={{ fontSize: 11, fontWeight: 600 }}>ASSISTANT</Text></>}
                {e.role === "user" && <><Text type="secondary" style={{ fontSize: 11, fontWeight: 600 }}>YOU</Text><UserOutlined style={{ color: "#999", fontSize: 13 }} /></>}
              </div>
              <div style={{ background: e.role === "user" ? "#e6f7ff" : "#f5f5f5", borderRadius: 8, padding: "12px 16px", fontSize: 14, lineHeight: 1.65, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{e.content}</div>
            </div>
          ))}
          {loading && <div style={{ textAlign: "center", padding: 20 }}><Spin /></div>}
          <div ref={endRef} />
        </div>
        {metrics && (
          <div style={{ padding: "6px 12px", background: "#f5f5f5", borderRadius: 8, margin: "8px 0" }}>
            <Space size={[8, 8]} wrap>
              <Text type="secondary" style={{ fontSize: 12 }}>Token: <b>{metrics.total_tokens}</b></Text>
              <Text type="secondary" style={{ fontSize: 12 }}>输入: {metrics.prompt_tokens}</Text>
              <Text type="secondary" style={{ fontSize: 12 }}>输出: {metrics.completion_tokens}</Text>
              <Text type="secondary" style={{ fontSize: 12, color: "#fa8c16" }}>{metrics.duration_ms}ms</Text>
            </Space>
          </div>
        )}
        <div style={{ borderTop: "1px solid #f0f0f0", paddingTop: 12 }}>
          <Input placeholder="System Prompt（可选）" value={systemPrompt} onChange={e => setSystemPrompt(e.target.value)} style={{ borderRadius: 8, marginBottom: 8, fontSize: 13 }} />
          <div style={{ position: "relative" }}>
            <TextArea placeholder="输入消息…" value={msg} onChange={e => setMsg(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }} rows={2} disabled={loading}
              style={{ borderRadius: 10, paddingRight: 48, fontSize: 14, borderColor: "#d9d9d9" }} />
            <div style={{ position: "absolute", right: 10, bottom: 10 }}>
              <Button type="primary" shape="circle" size="small" icon={<SendOutlined />} onClick={send} loading={loading} disabled={!model || !msg.trim()} />
            </div>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 6 }}>
            <Button type="text" size="small" icon={<ClearOutlined />} onClick={() => { setHistory([]); setMetrics(null); }}>清空对话</Button>
            <Text type="secondary" style={{ fontSize: 11 }}>Enter 发送 · Shift+Enter 换行</Text>
          </div>
        </div>
      </div>
      <div style={{ width: 260, borderLeft: "1px solid #f0f0f0", paddingLeft: 20, flexShrink: 0 }}>
        <Text style={{ fontSize: 12, fontWeight: 600, color: "#999", display: "block", marginBottom: 8 }}>MODEL</Text>
        <Select value={model || undefined} onChange={setModel} style={{ width: "100%" }} options={opts} placeholder="Select model" size="large" />
        <Divider style={{ margin: "20px 0" }} />
        <Text style={{ fontSize: 12, fontWeight: 600, color: "#999", display: "block", marginBottom: 8 }}>PARAMETERS</Text>
        {paramsPanel}
      </div>
    </div>
  );
}

function CompareView() {
  const { data } = useQuery({ queryKey: ["models"], queryFn: modelsApi.list });
  const models = data?.models || [];
  const [mA, setMA] = useState(""); const [mB, setMB] = useState("");
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<CompareResult[]>([]);
  const [input, setInput] = useState("");
  const compare = async () => {
    if (!mA || !mB || !input.trim()) return;
    setLoading(true); setResults([]);
    const nA = models.find(m => m.id === mA)?.model_name || "A";
    const nB = models.find(m => m.id === mB)?.model_name || "B";
    const res: CompareResult[] = [];
    for (const [id, name] of [[mA, nA], [mB, nB]] as [string, string][]) {
      try {
        const r = await modelsApi.test(id, { message: input, stream: false });
        res.push({ modelName: name, content: r.content || "", tokens: r.total_tokens || 0, duration: r.duration_ms || 0 });
      } catch (e: any) { res.push({ modelName: name, content: "", tokens: 0, duration: 0, error: e.message }); }
    }
    setResults(res); setLoading(false);
  };
  const opts = models.map(m => ({ label: <Space><ModelIcon modelName={m.model_name} size={18} />{m.model_name}</Space>, value: m.id }));

  return (
    <div>
      <Row gutter={[12, 12]} align="middle" style={{ marginBottom: 16 }}>
        <Col xs={24} sm={11}><Text type="secondary" style={{ fontSize: 12, display: "block", marginBottom: 4 }}>模型 A</Text><Select value={mA || undefined} onChange={setMA} style={{ width: "100%" }} options={opts} placeholder="Model A" size="large" /></Col>
        <Col xs={24} sm={2} style={{ textAlign: "center" }}><SwapOutlined style={{ color: "#d9d9d9", fontSize: 18 }} /></Col>
        <Col xs={24} sm={11}><Text type="secondary" style={{ fontSize: 12, display: "block", marginBottom: 4 }}>模型 B</Text><Select value={mB || undefined} onChange={setMB} style={{ width: "100%" }} options={opts} placeholder="Model B" size="large" /></Col>
      </Row>
      <TextArea placeholder="输入消息…" value={input} onChange={e => setInput(e.target.value)} rows={2} style={{ borderRadius: 10, marginBottom: 12, fontSize: 14 }} />
      <Button type="primary" size="large" icon={<SendOutlined />} onClick={compare} loading={loading} disabled={!mA || !mB || !input.trim()} block>对比发送</Button>
      {results.length > 0 && <Row gutter={[12, 12]} style={{ marginTop: 20 }}>
        {results.map((r, i) => <Col xs={24} md={12} key={i}>
          <Card title={<Space><RobotOutlined />{r.modelName}</Space>} size="small" style={{ borderColor: r.error ? "#ffccc7" : "#f0f0f0" }}
            extra={<Space size={4}>{r.tokens > 0 && <Tag>Token: {r.tokens}</Tag>}{r.duration > 0 && <Tag color="orange">{r.duration}ms</Tag>}</Space>}>
            {r.error ? <Text type="danger">{r.error}</Text> : <div style={{ whiteSpace: "pre-wrap", wordBreak: "break-word", fontSize: 14, lineHeight: 1.65, maxHeight: 400, overflow: "auto" }}>{r.content}</div>}
          </Card>
        </Col>)}
      </Row>}
    </div>
  );
}

export default function PlaygroundPage() {
  return (
    <div>
      <Title level={4} style={{ marginBottom: 16 }}>Playground</Title>
      <Tabs items={[
        { key: "chat", label: "Chat", children: <ChatView /> },
        { key: "compare", label: <Space><SwapOutlined />对比</Space>, children: <CompareView /> },
      ]} />
    </div>
  );
}
