import type { Metadata } from "next";
import { AntdRegistry } from "@ant-design/nextjs-registry";
import { App, ConfigProvider } from "antd";
import zhCN from "antd/locale/zh_CN";
import ReactQueryProvider from "@/contexts/ReactQueryProvider";
import { AuthProvider } from "@/contexts/AuthContext";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import "./globals.css";
import { Geist } from "next/font/google";
import { cn } from "@/lib/utils";

const geist = Geist({subsets:['latin'],variable:'--font-sans'});

export const metadata: Metadata = {
  title: "TransparentLLM - LLM 代理网关",
  description: "个人版 LLM 代理网关管理面板",
  icons: {
    icon: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-CN" className={cn("font-sans", geist.variable)}>
      <body>
        <AntdRegistry>
          <ConfigProvider locale={zhCN} theme={{ token: { colorPrimary: "#1677ff", colorLink: "#1677ff", colorSuccess: "#52c41a", colorWarning: "#faad14", colorError: "#ff4d4f" } }}>
            <ReactQueryProvider>
              <App>
                <AuthProvider><ErrorBoundary>{children}</ErrorBoundary></AuthProvider>
              </App>
            </ReactQueryProvider>
          </ConfigProvider>
        </AntdRegistry>
      </body>
    </html>
  );
}
