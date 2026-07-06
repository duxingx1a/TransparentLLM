"use client";

import React, { useState, useCallback } from "react";
import { Typography, Button, Tooltip, message } from "antd";
import { CopyOutlined, CheckOutlined } from "@ant-design/icons";

const { Text } = Typography;

interface CommandCardProps {
  title: string;
  description?: string;
  commandWithJq: string;
  commandWithoutJq: string;
  language?: string;
}

export function CommandCard({
  title,
  description,
  commandWithJq,
  commandWithoutJq,
  language = "bash",
}: CommandCardProps) {
  const [useJq, setUseJq] = useState(true);
  const [copied, setCopied] = useState(false);

  const currentCommand = useJq ? commandWithJq : commandWithoutJq;

  const handleCopy = useCallback(() => {
    // 统一换行符为 \n，避免 Windows 上 \r\n 粘贴到终端出现乱码
    const clean = currentCommand.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
    navigator.clipboard.writeText(clean).then(() => {
      setCopied(true);
      message.success({
        content: `${title ? title + " " : ""}命令已复制到剪贴板 ✅`,
        duration: 2,
      });
      setTimeout(() => setCopied(false), 2000);
    });
  }, [currentCommand, title]);

  // 如果没有 title，只渲染内容区域（不包裹 Card）
  if (!title) {
    return (
      <div>
        {/* 工具栏 */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 12,
          }}
        >
          <div style={{ display: "flex", gap: 6 }}>
            <Button
              size="small"
              type={useJq ? "primary" : "default"}
              onClick={() => setUseJq(true)}
              style={{
                borderRadius: 6,
                fontWeight: 500,
                ...(useJq ? { boxShadow: "0 2px 4px rgba(22, 119, 255, 0.2)" } : {}),
              }}
            >
              带 jq
            </Button>
            <Button
              size="small"
              type={!useJq ? "primary" : "default"}
              onClick={() => setUseJq(false)}
              style={{
                borderRadius: 6,
                fontWeight: 500,
                ...(!useJq ? { boxShadow: "0 2px 4px rgba(22, 119, 255, 0.2)" } : {}),
              }}
            >
              原始输出
            </Button>
          </div>
          <Tooltip title={copied ? "已复制!" : "复制到剪贴板"}>
            <Button
              size="small"
              type={copied ? "primary" : "default"}
              icon={copied ? <CheckOutlined /> : <CopyOutlined />}
              onClick={handleCopy}
              style={{
                borderRadius: 6,
                fontWeight: 500,
                ...(copied
                  ? { borderColor: "#52c41a", color: "#52c41a" }
                  : {}),
              }}
            >
              {copied ? "已复制" : "复制"}
            </Button>
          </Tooltip>
        </div>

        {/* 代码块 */}
        <div style={{ position: "relative" }}>
          <div
            style={{
              position: "absolute",
              top: 10,
              right: 12,
              fontSize: 11,
              color: "rgba(255,255,255,0.4)",
              userSelect: "none",
              textTransform: "uppercase",
              letterSpacing: "0.5px",
            }}
          >
            {language}
          </div>
          <pre
            style={{
              background: "#0d1117",
              color: "#e6edf3",
              padding: "16px 16px 16px 16px",
              borderRadius: 10,
              fontSize: 13,
              overflow: "auto",
              lineHeight: 1.7,
              margin: 0,
              border: "1px solid #21262d",
              boxShadow: "inset 0 1px 0 rgba(255,255,255,0.03)",
            }}
          >
            <code>{currentCommand}</code>
          </pre>
        </div>

        {/* 提示信息 */}
        {useJq && (
          <div
            style={{
              marginTop: 10,
              padding: "8px 12px",
              background: "rgba(22, 119, 255, 0.04)",
              borderRadius: 8,
              border: "1px solid rgba(22, 119, 255, 0.08)",
            }}
          >
            <Text
              type="secondary"
              style={{ fontSize: 12 }}
            >
              💡 <code style={{ background: "rgba(0,0,0,0.06)", padding: "2px 6px", borderRadius: 4 }}>jq</code> 可选，用于格式化 JSON 输出。
              <code style={{ background: "rgba(0,0,0,0.06)", padding: "2px 6px", borderRadius: 4, marginLeft: 4 }}>apt install jq</code>
              <span style={{ margin: "0 4px" }}>/</span>
              <code style={{ background: "rgba(0,0,0,0.06)", padding: "2px 6px", borderRadius: 4 }}>brew install jq</code>
            </Text>
          </div>
        )}
      </div>
    );
  }

  return (
    <div
      style={{
        marginBottom: 24,
        background: "#fff",
        borderRadius: 16,
        padding: 24,
        border: "1px solid rgba(0,0,0,0.06)",
        boxShadow: "0 2px 8px rgba(0,0,0,0.04)",
      }}
    >
      {/* 标题区域 */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 16,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 18 }}>{title.split(" ")[0]}</span>
          <div>
            <Text strong style={{ fontSize: 15 }}>
              {title.split(" ").slice(1).join(" ")}
            </Text>
            {description && (
              <Text type="secondary" style={{ fontSize: 12, marginLeft: 8 }}>
                {description}
              </Text>
            )}
          </div>
        </div>

        <div style={{ display: "flex", gap: 6 }}>
          <Button
            size="small"
            type={useJq ? "primary" : "default"}
            onClick={() => setUseJq(true)}
            style={{
              borderRadius: 6,
              fontWeight: 500,
              ...(useJq ? { boxShadow: "0 2px 4px rgba(22, 119, 255, 0.2)" } : {}),
            }}
          >
            带 jq
          </Button>
          <Button
            size="small"
            type={!useJq ? "primary" : "default"}
            onClick={() => setUseJq(false)}
            style={{
              borderRadius: 6,
              fontWeight: 500,
              ...(!useJq ? { boxShadow: "0 2px 4px rgba(22, 119, 255, 0.2)" } : {}),
            }}
          >
            原始输出
          </Button>
          <Tooltip title={copied ? "已复制!" : "复制到剪贴板"}>
            <Button
              size="small"
              type={copied ? "primary" : "default"}
              icon={copied ? <CheckOutlined /> : <CopyOutlined />}
              onClick={handleCopy}
              style={{
                borderRadius: 6,
                fontWeight: 500,
                ...(copied
                  ? { borderColor: "#52c41a", color: "#52c41a" }
                  : {}),
              }}
            >
              {copied ? "已复制" : "复制"}
            </Button>
          </Tooltip>
        </div>
      </div>

      {/* 代码块 */}
      <div style={{ position: "relative" }}>
        <div
          style={{
            position: "absolute",
            top: 10,
            right: 12,
            fontSize: 11,
            color: "rgba(255,255,255,0.4)",
            userSelect: "none",
            textTransform: "uppercase",
            letterSpacing: "0.5px",
          }}
        >
          {language}
        </div>
        <pre
          style={{
            background: "#0d1117",
            color: "#e6edf3",
            padding: "16px 16px 16px 16px",
            borderRadius: 10,
            fontSize: 13,
            overflow: "auto",
            lineHeight: 1.7,
            margin: 0,
            border: "1px solid #21262d",
            boxShadow: "inset 0 1px 0 rgba(255,255,255,0.03)",
          }}
        >
          <code>{currentCommand}</code>
        </pre>
      </div>

      {/* 提示信息 */}
      {useJq && (
        <div
          style={{
            marginTop: 12,
            padding: "8px 12px",
            background: "rgba(22, 119, 255, 0.04)",
            borderRadius: 8,
            border: "1px solid rgba(22, 119, 255, 0.08)",
          }}
        >
          <Text
            type="secondary"
            style={{ fontSize: 12 }}
          >
            💡 <code style={{ background: "rgba(0,0,0,0.06)", padding: "2px 6px", borderRadius: 4 }}>jq</code> 可选，用于格式化 JSON 输出。
            <code style={{ background: "rgba(0,0,0,0.06)", padding: "2px 6px", borderRadius: 4, marginLeft: 4 }}>apt install jq</code>
            <span style={{ margin: "0 4px" }}>/</span>
            <code style={{ background: "rgba(0,0,0,0.06)", padding: "2px 6px", borderRadius: 4 }}>brew install jq</code>
          </Text>
        </div>
      )}
    </div>
  );
}