/** @type {import('next').NextConfig} */
const nextConfig = {
  // 静态导出模式，构建产物嵌入 Rust 二进制
  output: "export",
  // 允许 127.0.0.1 跨域访问开发资源
  allowedDevOrigins: ["127.0.0.1"],
  // 所有路由统一加 /ui 前缀（照搬 LiteLLM，Rust 后端通过 /ui/* 提供静态文件）
  assetPrefix: "/ui",
  basePath: "/ui",
  // 禁用图片优化（静态导出需要）
  images: { unoptimized: true },
  trailingSlash: false,
  // 环境变量（客户端可用）
  env: {
    NEXT_PUBLIC_API_BASE: process.env.NEXT_PUBLIC_API_BASE || "http://127.0.0.1:14000",
  },
};

export default nextConfig;
