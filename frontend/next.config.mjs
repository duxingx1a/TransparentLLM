/** @type {import('next').NextConfig} */
const isDev = process.env.NODE_ENV === "development";

const nextConfig = {
  // 静态导出模式（仅生产构建）
  ...(isDev ? {} : { output: "export" }),
  allowedDevOrigins: ["127.0.0.1"],
  // /ui 前缀
  assetPrefix: isDev ? "" : "/ui",
  basePath: isDev ? "" : "/ui",
  images: { unoptimized: true },
  trailingSlash: false,
  env: {
    NEXT_PUBLIC_API_BASE: "",
  },
};

// 开发环境：把 / /v1/* /api/* /health 代理到 Rust 后端
// beforeFiles 确保优先级高于 Next.js 页面路由
if (isDev) {
  nextConfig.rewrites = async () => ({
    beforeFiles: [
      { source: "/", destination: "http://127.0.0.1:18400/" },
      { source: "/v1/:path*", destination: "http://127.0.0.1:18400/v1/:path*" },
      { source: "/api/:path*", destination: "http://127.0.0.1:18400/api/:path*" },
      { source: "/health", destination: "http://127.0.0.1:18400/health" },
    ],
  });
}

export default nextConfig;
