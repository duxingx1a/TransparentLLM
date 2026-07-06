"use client";

import React from "react";
import { useParams, useRouter } from "next/navigation";
import {
  Card,
  Descriptions,
  Tag,
  Typography,
  Button,
  Spin,
  Empty,
  Space,
  Divider,
} from "antd";
import {
  ArrowLeftOutlined,
  RobotOutlined,
  UserOutlined,
  SettingOutlined,
} from "@ant-design/icons";
import { useQuery } from "@tanstack/react-query";
import { logsApi } from "@/lib/api";
import type { RequestLogDetail } from "@/types";
import dayjs from "dayjs";

const { Title, Text, Paragraph } = Typography;

/** 格式化耗时 */
function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

/** 格式化金额 */
function formatSpend(n: number): string {
  return `¥${n.toFixed(4)}`;
}

export default function LogDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const { data, isLoading, error } = useQuery<RequestLogDetail>({
    queryKey: ["log-detail", id],
    queryFn: () => logsApi.detail(id),
    enabled: !!id,
  });

  if (isLoading) {
    return (
      <div style={{ textAlign: "center", padding: 100 }}>
        <Spin size="large" />
      </div>
    );
  }

  if (error || !data) {
    return <Empty description="日志不存在或加载失败" />;
  }

  return (
    <div className="w-full p-6 box-border">
      <div style={{ position: "sticky", top: 0, zIndex: 10, background: "#fff", paddingBottom: 8, marginBottom: 8 }}>
        <Button
          icon={<ArrowLeftOutlined />}
          onClick={() => router.push("/logs")}
        >
          返回列表
        </Button>
      </div>

      <h1 className="text-xl font-semibold mb-6">日志详情</h1>

      {/* 基本信息 */}
      <Card title="基本信息" style={{ marginBottom: 16 }}>
        <Descriptions bordered size="small" column={{ xs: 1, sm: 2, md: 3 }}>
          <Descriptions.Item label="模型">{data.model_name}</Descriptions.Item>
          <Descriptions.Item label="提供商">
            <Tag>{data.provider}</Tag>
          </Descriptions.Item>
          <Descriptions.Item label="来源">
            <Tag color="blue">{data.source_tag}</Tag>
          </Descriptions.Item>
          <Descriptions.Item label="状态">
            <Tag color={data.status === "success" ? "green" : "red"}>
              {data.status}
            </Tag>
          </Descriptions.Item>
          <Descriptions.Item label="耗时">
            {formatDuration(data.duration_ms)}
          </Descriptions.Item>
          <Descriptions.Item label="API 地址">
            {data.api_base}
          </Descriptions.Item>
          <Descriptions.Item label="开始时间">
            {dayjs(data.start_time).format("YYYY-MM-DD HH:mm:ss")}
          </Descriptions.Item>
          <Descriptions.Item label="结束时间">
            {dayjs(data.end_time).format("YYYY-MM-DD HH:mm:ss")}
          </Descriptions.Item>
          {data.completion_start_time && (
            <Descriptions.Item label="首 Token 时间">
              {dayjs(data.completion_start_time).format("YYYY-MM-DD HH:mm:ss")}
            </Descriptions.Item>
          )}
        </Descriptions>
      </Card>

      {/* Token 用量 */}
      <Card title="用量信息" style={{ marginBottom: 16 }}>
        <Descriptions bordered size="small" column={{ xs: 1, sm: 2, md: 3 }}>
          <Descriptions.Item label="总 Token">
            <Text strong>{data.total_tokens}</Text>
          </Descriptions.Item>
          <Descriptions.Item label="输入 Token">
            {data.prompt_tokens}
          </Descriptions.Item>
          <Descriptions.Item label="输出 Token">
            {data.completion_tokens}
          </Descriptions.Item>
          <Descriptions.Item label="费用">
            <Text strong style={{ color: "#fa8c16" }}>
              {formatSpend(data.spend)}
            </Text>
          </Descriptions.Item>
          <Descriptions.Item label="缓存命中">
            {data.cache_hit ? (
              <Tag color="gold">是</Tag>
            ) : (
              <Tag>否</Tag>
            )}
          </Descriptions.Item>
          {data.cache_key && (
            <Descriptions.Item label="缓存 Key">
              <code style={{ fontSize: 12 }}>{data.cache_key}</code>
            </Descriptions.Item>
          )}
        </Descriptions>
      </Card>

      {/* 请求消息 */}
      {data.messages && data.messages.length > 0 && (
        <Card title="请求消息" style={{ marginBottom: 16 }}>
          {data.messages.map((msg, index) => (
            <div
              key={index}
              className={`message-bubble ${msg.role}`}
              style={{ marginBottom: 8 }}
            >
              <div style={{ marginBottom: 4 }}>
                {msg.role === "system" && (
                  <Space>
                    <SettingOutlined />
                    <Text strong>System</Text>
                  </Space>
                )}
                {msg.role === "user" && (
                  <Space>
                    <UserOutlined />
                    <Text strong>User</Text>
                  </Space>
                )}
                {msg.role === "assistant" && (
                  <Space>
                    <RobotOutlined />
                    <Text strong>Assistant</Text>
                  </Space>
                )}
              </div>
              <Paragraph
                style={{
                  margin: 0,
                  whiteSpace: "pre-wrap",
                  wordBreak: "break-word",
                  maxHeight: 300,
                  overflow: "auto",
                }}
              >
                {msg.content}
              </Paragraph>
            </div>
          ))}
        </Card>
      )}

      {/* 响应内容 */}
      {data.response_text && (
        <Card title="响应内容" style={{ marginBottom: 16 }}>
          <Paragraph
            style={{
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
              maxHeight: 400,
              overflow: "auto",
            }}
          >
            {data.response_text}
          </Paragraph>
        </Card>
      )}

      {/* 错误信息 */}
      {data.error_msg && (
        <Card
          title="错误信息"
          style={{ marginBottom: 16, borderColor: "#ff4d4f" }}
        >
          <Text type="danger">{data.error_msg}</Text>
        </Card>
      )}
    </div>
  );
}
