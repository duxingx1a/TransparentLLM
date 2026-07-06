"use client";

import React from "react";
import { Avatar } from "antd";
import { appPath } from "@/lib/paths";

// 模型图标：本地 serve
const modelFaviconMap: Record<string, string> = {
  openai: appPath("/favicons/openai_com.png"),
  gpt: appPath("/favicons/openai_com.png"),
  anthropic: appPath("/favicons/anthropic_com.png"),
  claude: appPath("/favicons/anthropic_com.png"),
  deepseek: appPath("/favicons/deepseek_com.png"),
  qwen: appPath("/favicons/tongyi_aliyun_com.png"),
  alibaba: appPath("/favicons/aliyun_com.png"),
  glm: appPath("/favicons/bigmodel_cn.png"),
  zhipu: appPath("/favicons/zhipu.svg"),
  minimax: appPath("/favicons/minimax.svg"),
  dogress: appPath("/favicons/dogress.svg"),
  dotop: appPath("/favicons/dogress.svg"),
  xiaomi: appPath("/favicons/xiaomi_com.png"),
  mi: appPath("/favicons/xiaomi_com.png"),
  gemini: appPath("/favicons/gemini_google_com.png"),
  google: appPath("/favicons/google_com.png"),
  llama: appPath("/favicons/llama_com.png"),
  meta: appPath("/favicons/meta_com.png"),
  mistral: appPath("/favicons/mistral_ai.png"),
  cohere: appPath("/favicons/cohere_com.png"),
};

// 来源图标
const sourceFaviconMap: Record<string, string> = {
  transparentllm: appPath("/favicon.svg"),
  copilot: appPath("/favicons/github_com.png"),
  github: appPath("/favicons/github_com.png"),
  node: appPath("/favicons/nodejs_org.png"),
  python: appPath("/favicons/python_org.png"),
  curl: appPath("/favicons/curl_se.png"),
  go: appPath("/favicons/go_dev.png"),
};

function matchIcon(name: string, map: Record<string, string>): string | null {
  const key = name.toLowerCase();
  for (const [k, url] of Object.entries(map)) {
    if (key.includes(k)) return url;
  }
  return null;
}

export function ModelIcon({ modelName, size = 20 }: { modelName: string; size?: number }) {
  const src = matchIcon(modelName, modelFaviconMap);
  if (!src) return <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><Avatar size={size} style={{ backgroundColor: "#ddd", fontSize: 12, flexShrink: 0 }}>?</Avatar>{modelName}</span>;
  return <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><Avatar size={size} src={src} style={{ flexShrink: 0 }} />{modelName}</span>;
}

export function SourceIcon({ sourceTag, size = 20 }: { sourceTag: string; size?: number }) {
  const src = matchIcon(sourceTag, sourceFaviconMap);
  if (!src) return <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><Avatar size={size} style={{ backgroundColor: "#ddd", fontSize: 12, flexShrink: 0 }}>?</Avatar>{sourceTag}</span>;
  return <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><Avatar size={size} src={src} style={{ flexShrink: 0 }} />{sourceTag}</span>;
}

export function ProviderIcon({ provider, size = 20 }: { provider: string; size?: number }) {
  return <ModelIcon modelName={provider} size={size} />;
}
