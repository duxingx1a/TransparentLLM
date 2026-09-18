"use client";

import React, { useState } from "react";
import {
  Card,
  Form,
  InputNumber,
  Button,
  Typography,
  message,
  Spin,
  Space,
} from "antd";
import { SaveOutlined } from "@ant-design/icons";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { settingsApi } from "@/lib/api";
import type { AppSettings } from "@/types";

const { Text } = Typography;

export default function SettingsPage() {
  const [generalForm] = Form.useForm();
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
    <div className="w-full p-6 overflow-x-hidden box-border">
      <h1 className="text-xl font-semibold mb-6">系统设置</h1>

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
    </div>
  );
}
