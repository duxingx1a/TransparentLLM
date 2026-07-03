import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { AntdRegistry } from "@ant-design/nextjs-registry";
import { ConfigProvider } from "antd";
import zhCN from "antd/locale/zh_CN";
import ReactQueryProvider from "@/contexts/ReactQueryProvider";
import { AuthProvider } from "@/contexts/AuthContext";
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "TransparentLLM - LLM 代理网关",
  description: "个人版 LLM 代理网关管理面板",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-CN">
      <body className={inter.className}>
        <AntdRegistry>
          <ConfigProvider locale={zhCN}>
            <ReactQueryProvider>
              <AuthProvider>{children}</AuthProvider>
            </ReactQueryProvider>
          </ConfigProvider>
        </AntdRegistry>
      </body>
    </html>
  );
}
