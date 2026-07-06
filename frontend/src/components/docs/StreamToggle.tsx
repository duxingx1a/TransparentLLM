"use client";

import React from "react";
import { Radio, Typography } from "antd";

const { Text } = Typography;

interface StreamToggleProps {
  value: "stream" | "non-stream";
  onChange: (value: "stream" | "non-stream") => void;
  style?: React.CSSProperties;
}

export function StreamToggle({ value, onChange, style }: StreamToggleProps) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, ...style }}>
      <Text strong style={{ fontSize: 13, whiteSpace: "nowrap" }}>模式</Text>
      <Radio.Group
        value={value}
        onChange={(e) => onChange(e.target.value)}
        optionType="button"
        buttonStyle="solid"
        size="small"
        style={{ borderRadius: 8 }}
      >
        <Radio.Button
          value="stream"
          style={{
            borderRadius: "6px 0 0 6px",
            fontWeight: 500,
          }}
        >
          流式
        </Radio.Button>
        <Radio.Button
          value="non-stream"
          style={{
            borderRadius: "0 6px 6px 0",
            fontWeight: 500,
          }}
        >
          非流式
        </Radio.Button>
      </Radio.Group>
    </div>
  );
}