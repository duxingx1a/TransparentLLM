"use client";

import React from "react";
import { Select, Typography, Tag } from "antd";
import { useQuery } from "@tanstack/react-query";
import { modelsApi } from "@/lib/api";
import type { ModelConfig } from "@/types";

const { Text } = Typography;

interface ModelSelectProps {
  value?: string;
  onChange?: (value: string) => void;
  style?: React.CSSProperties;
}

/** 根据 provider 返回对应颜色 */
function providerColor(p: string): string {
  const map: Record<string, string> = {
    openai: "green",
    anthropic: "orange",
    deepseek: "blue",
    zhipu: "purple",
    qwen: "cyan",
    moonshot: "geekblue",
    volcengine: "volcano",
  };
  return map[p.toLowerCase()] || "default";
}

export function ModelSelect({ value, onChange, style }: ModelSelectProps) {
  const { data: modelsData, isLoading } = useQuery({
    queryKey: ["models"],
    queryFn: modelsApi.list,
  });

  const models: ModelConfig[] = modelsData?.models || [];

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, ...style }}>
      <Text strong style={{ fontSize: 13, whiteSpace: "nowrap" }}>选择模型</Text>
      <Select
        value={value || undefined}
        onChange={onChange}
        style={{ minWidth: 320, flex: 1 }}
        loading={isLoading}
        showSearch
        popupMatchSelectWidth={false}
        filterOption={(input, option) =>
          (option?.label ?? "")
            .toString()
            .toLowerCase()
            .includes(input.toLowerCase())
        }
        options={models.map((m) => ({
          label: (
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontWeight: 500 }}>{m.model_name}</span>
              <Tag
                color={providerColor(m.provider)}
                style={{
                  marginLeft: "auto",
                  borderRadius: 4,
                  fontSize: 11,
                  lineHeight: "18px",
                  padding: "0 6px",
                }}
              >
                {m.provider}
              </Tag>
            </div>
          ),
          value: `${m.provider}-${m.model_name}`,
        }))}
        placeholder="选择已配置的模型"
      />
    </div>
  );
}