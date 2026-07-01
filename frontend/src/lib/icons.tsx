"use client";

import React from "react";
import { Avatar } from "antd";

// 模型图标：使用 Google Favicon API 获取真实网站图标
const modelFaviconMap: Record<string, string> = {
  openai: "https://www.google.com/s2/favicons?domain=openai.com&sz=32",
  gpt: "https://www.google.com/s2/favicons?domain=openai.com&sz=32",
  anthropic: "https://www.google.com/s2/favicons?domain=anthropic.com&sz=32",
  claude: "https://www.google.com/s2/favicons?domain=anthropic.com&sz=32",
  deepseek: "https://www.google.com/s2/favicons?domain=deepseek.com&sz=32",
  qwen: "https://www.google.com/s2/favicons?domain=tongyi.aliyun.com&sz=32",
  alibaba: "https://www.google.com/s2/favicons?domain=aliyun.com&sz=32",
  glm: "https://www.google.com/s2/favicons?domain=bigmodel.cn&sz=32",
  zhipu: "https://www.google.com/s2/favicons?domain=bigmodel.cn&sz=32",
  minimax: "https://www.google.com/s2/favicons?domain=minimax.io&sz=32",
  xiaomi: "https://www.google.com/s2/favicons?domain=xiaomi.com&sz=32",
  mi: "https://www.google.com/s2/favicons?domain=xiaomi.com&sz=32",
  gemini: "https://www.google.com/s2/favicons?domain=gemini.google.com&sz=32",
  google: "https://www.google.com/s2/favicons?domain=google.com&sz=32",
  llama: "https://www.google.com/s2/favicons?domain=llama.com&sz=32",
  meta: "https://www.google.com/s2/favicons?domain=meta.com&sz=32",
  mistral: "https://www.google.com/s2/favicons?domain=mistral.ai&sz=32",
  cohere: "https://www.google.com/s2/favicons?domain=cohere.com&sz=32",
};

// 来源图标
const sourceFaviconMap: Record<string, string> = {
  copilot: "https://www.google.com/s2/favicons?domain=github.com&sz=32",
  github: "https://www.google.com/s2/favicons?domain=github.com&sz=32",
  node: "https://www.google.com/s2/favicons?domain=nodejs.org&sz=32",
  python: "https://www.google.com/s2/favicons?domain=python.org&sz=32",
  curl: "https://www.google.com/s2/favicons?domain=curl.se&sz=32",
  go: "https://www.google.com/s2/favicons?domain=go.dev&sz=32",
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
