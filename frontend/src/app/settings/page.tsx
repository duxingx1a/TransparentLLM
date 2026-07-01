"use client";

import React, { useState } from "react";
import {
  Card,
  Form,
  Input,
  InputNumber,
  Button,
  Typography,
  Divider,
  message,
  Spin,
  Space,
  Alert,
} from "antd";
import { SaveOutlined, KeyOutlined } from "@ant-design/icons";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { settingsApi } from "@/lib/api";
import type { AppSettings } from "@/types";

const { Title, Text } = Typography;

export default function SettingsPage() {
  const [generalForm] = Form.useForm();
  const [keyForm] = Form.useForm();
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery<AppSettings>({
    queryKey: ["settings"],
    queryFn: settingsApi.get,
  });

  // 更新常规设置
  const updateSettings = useMutation({
    mutationFn: (values: { log_retention_days: number }) =>
      settingsApi.update(values),
    onSuccess: () => {
      message.success("设置已保存");
      queryClient.invalidateQueries({ queryKey: ["settings"] });
    },
    onError: (err: Error) => message.error(err.message),
  });

  // 修改主密钥
  const updateKey = useMutation({
    mutationFn: (values: {
      old_master_key: string;
      master_key: string;
    }) => settingsApi.update(values),
    onSuccess: () => {
      message.success("主密钥已更新");
      keyForm.resetFields();
    },
    onError: (err: Error) => message.error(err.message),
  });

  // 加载设置到表单
  React.useEffect(() => {
    if (data) {
      generalForm.setFieldsValue({
        log_retention_days: data.log_retention_days,
      });
    }
  }, [data, generalForm]);

  if (isLoading) {
    return (
      <div style={{ textAlign: "center", padding: 100 }}>
        <Spin size="large" />
      </div>
    );
  }

  return (
    <div>
      <Title level={4} style={{ marginBottom: 24 }}>
        系统设置
      </Title>

      {/* 版本信息 */}
      <Card style={{ marginBottom: 24 }}>
        <Space direction="vertical">
          <Text strong>TransparentLLM</Text>
          <Text type="secondary">版本：{data?.version || "-"}</Text>
        </Space>
      </Card>

      {/* 常规设置 */}
      <Card title="常规设置" style={{ marginBottom: 24 }}>
        <Form
          form={generalForm}
          layout="vertical"
          onFinish={(values) => updateSettings.mutate(values)}
        >
          <Form.Item
            name="log_retention_days"
            label="日志保留天数"
            extra="超过该天数的详细请求日志将被自动清理，每日统计数据永久保留"
          >
            <InputNumber min={1} max={365} style={{ width: 200 }} />
          </Form.Item>
          <Form.Item>
            <Button
              type="primary"
              icon={<SaveOutlined />}
              htmlType="submit"
              loading={updateSettings.isPending}
            >
              保存设置
            </Button>
          </Form.Item>
        </Form>
      </Card>

      {/* 修改主密钥 */}
      <Card title="修改主密钥">
        <Alert
          message="修改主密钥需要验证旧密钥，请确保记住新密钥"
          type="warning"
          showIcon
          style={{ marginBottom: 16 }}
        />
        <Form
          form={keyForm}
          layout="vertical"
          onFinish={(values) => updateKey.mutate(values)}
        >
          <Form.Item
            name="old_master_key"
            label="当前主密钥"
            rules={[{ required: true, message: "请输入当前主密钥" }]}
          >
            <Input.Password
              placeholder="输入当前主密钥"
              prefix={<KeyOutlined />}
            />
          </Form.Item>
          <Form.Item
            name="master_key"
            label="新主密钥"
            rules={[
              { required: true, message: "请输入新主密钥" },
              { min: 8, message: "密钥长度至少 8 位" },
            ]}
          >
            <Input.Password
              placeholder="输入新主密钥（至少 8 位）"
              prefix={<KeyOutlined />}
            />
          </Form.Item>
          <Form.Item>
            <Button
              type="primary"
              icon={<SaveOutlined />}
              htmlType="submit"
              loading={updateKey.isPending}
              danger
            >
              更新主密钥
            </Button>
          </Form.Item>
        </Form>
      </Card>
    </div>
  );
}
