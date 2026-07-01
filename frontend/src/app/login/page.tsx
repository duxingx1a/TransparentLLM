"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, Form, Input, Button, Typography, Alert, Space } from "antd";
import { InfoCircleOutlined } from "@ant-design/icons";
import { useAuth } from "@/contexts/AuthContext";

const { Title, Text, Paragraph } = Typography;

export default function LoginPage() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const { login, isAuthenticated, isLoading } = useAuth();
  const router = useRouter();

  // 已登录则跳转
  React.useEffect(() => {
    if (!isLoading && isAuthenticated) {
      router.replace("/dashboard");
    }
  }, [isLoading, isAuthenticated, router]);

  const handleSubmit = async (values: { master_key: string }) => {
    setLoading(true);
    setError("");
    try {
      await login(values.master_key);
      router.replace("/dashboard");
    } catch (err: any) {
      setError(err.message || "登录失败，请检查主密钥");
    } finally {
      setLoading(false);
    }
  };

  if (isLoading) return null;

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: "#f9fafb",
      }}
    >
      <Card
        style={{
          width: "100%",
          maxWidth: 512,
          boxShadow: "0 1px 3px 0 rgb(0 0 0 / 0.1), 0 1px 2px -1px rgb(0 0 0 / 0.1)",
        }}
      >
        <Space direction="vertical" size="middle" style={{ width: "100%" }}>
          {/* 标题 */}
          <div style={{ textAlign: "center" }}>
            <Title level={2} style={{ marginBottom: 0 }}>🔍 TransparentLLM</Title>
          </div>

          <div style={{ textAlign: "center" }}>
            <Title level={3} style={{ marginBottom: 4 }}>登录</Title>
            <Text type="secondary">访问您的 LLM 代理网关管理面板</Text>
          </div>

          {/* 默认凭据提示 */}
          <Alert
            message="默认凭据"
            description={
              <>
                <Paragraph style={{ fontSize: 13, marginBottom: 4 }}>
                  密码为您设置的 <code style={{ background: "#f5f5f5", padding: "1px 4px", borderRadius: 4, fontSize: 12 }}>TRANSPARENTLLM_MASTER_KEY</code> 环境变量值。
                </Paragraph>
                <Paragraph style={{ fontSize: 13, marginBottom: 0 }}>
                  首次使用？请设置环境变量后重启服务。
                </Paragraph>
              </>
            }
            type="info"
            icon={<InfoCircleOutlined />}
            showIcon
          />

          {/* 错误提示 */}
          {error && <Alert message={error} type="error" showIcon />}

          {/* 登录表单 */}
          <Form onFinish={handleSubmit} layout="vertical" requiredMark={false}>
            <Form.Item
              label="主密钥"
              name="master_key"
              rules={[{ required: true, message: "请输入您的主密钥" }]}
            >
              <Input.Password
                placeholder="输入您的主密钥"
                autoComplete="current-password"
                disabled={loading}
                size="large"
              />
            </Form.Item>

            <Form.Item>
              <Button
                type="primary"
                htmlType="submit"
                loading={loading}
                disabled={loading}
                block
                size="large"
              >
                {loading ? "登录中..." : "登录"}
              </Button>
            </Form.Item>
          </Form>
        </Space>
      </Card>
    </div>
  );
}
