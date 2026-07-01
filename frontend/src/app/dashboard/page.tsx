"use client";

import React, { useState } from "react";
import { Card, Col, Row, Statistic, Table, Spin, Typography, Empty, Select, DatePicker, Space } from "antd";
import { useQuery } from "@tanstack/react-query";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { statsApi } from "@/lib/api";
import { ModelIcon, SourceIcon } from "@/lib/icons";
import type { DashboardOverview } from "@/types";
import dayjs from "dayjs";

const { Title } = Typography;

// 时间范围选项
const timeRangeOptions = [
  { label: "过去 15 分钟", value: "15m" },
  { label: "过去 1 小时", value: "1h" },
  { label: "过去 1 天", value: "1d" },
  { label: "过去 7 天", value: "7d" },
  { label: "过去 30 天", value: "30d" },
  { label: "自定义", value: "custom" },
];

function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function formatSpend(n: number): string {
  return `¥${n.toFixed(4)}`;
}

export default function DashboardPage() {
  const [timeRange, setTimeRange] = useState("1d");
  const [customRange, setCustomRange] = useState<[string, string] | null>(null);

  const { data, isLoading } = useQuery<DashboardOverview>({
    queryKey: ["dashboard-overview", timeRange, customRange],
    queryFn: () => statsApi.overview(),
  });

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
        <Title level={4} style={{ margin: 0 }}>用量总览</Title>
        <Space>
          <Select
            value={timeRange}
            onChange={(val) => {
              setTimeRange(val);
              if (val !== "custom") setCustomRange(null);
            }}
            options={timeRangeOptions}
            style={{ width: 160 }}
          />
          {timeRange === "custom" && (
            <DatePicker.RangePicker
              onChange={(dates) => {
                if (dates && dates[0] && dates[1]) {
                  setCustomRange([dates[0].format("YYYY-MM-DD"), dates[1].format("YYYY-MM-DD")]);
                } else {
                  setCustomRange(null);
                }
              }}
              allowClear
              placeholder={["开始日期", "结束日期"]}
            />
          )}
        </Space>
      </div>

      {isLoading ? (
        <div style={{ textAlign: "center", padding: 60 }}><Spin size="large" /></div>
      ) : data ? (
        <>
          {/* 调用统计 */}
          <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
            <Col xs={12} sm={8} md={6}>
              <Card size="small"><Statistic title="总调用次数" value={data.today.total_requests} /></Card>
            </Col>
            <Col xs={12} sm={8} md={6}>
              <Card size="small"><Statistic title="成功调用" value={data.today.total_requests} valueStyle={{ color: "#52c41a" }} /></Card>
            </Col>
            <Col xs={12} sm={8} md={6}>
              <Card size="small"><Statistic title="失败调用" value={0} valueStyle={{ color: "#ff4d4f" }} /></Card>
            </Col>
          </Row>

          {/* Token 统计 */}
          <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
            <Col xs={12} sm={6}>
              <Card size="small"><Statistic title="输入 Token" value={formatNumber(data.today.prompt_tokens ?? data.total.total_tokens)} /></Card>
            </Col>
            <Col xs={12} sm={6}>
              <Card size="small"><Statistic title="输出 Token" value={formatNumber(data.today.completion_tokens ?? 0)} /></Card>
            </Col>
            <Col xs={12} sm={6}>
              <Card size="small"><Statistic title="累计 Token" value={formatNumber(data.total.total_tokens)} /></Card>
            </Col>
            <Col xs={12} sm={6}>
              <Card size="small"><Statistic title="缓存输入 Token" value={formatNumber(data.today.cache_tokens ?? 0)} /></Card>
            </Col>
          </Row>

          {/* 费用 */}
          <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
            <Col xs={12} sm={8}>
              <Card size="small"><Statistic title="今日费用" value={formatSpend(data.today.total_spend)} precision={4} /></Card>
            </Col>
            <Col xs={12} sm={8}>
              <Card size="small"><Statistic title="累计费用" value={formatSpend(data.total.total_spend)} precision={4} /></Card>
            </Col>
          </Row>

          {/* 趋势图 */}
          {data.daily_trend.length > 0 && (
            <Card title="每日用量趋势" size="small" style={{ marginBottom: 24 }}>
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={data.daily_trend}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" tick={{ fontSize: 12 }} />
                  <YAxis yAxisId="left" tick={{ fontSize: 12 }} />
                  <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 12 }} />
                  <Tooltip />
                  <Legend />
                  <Line yAxisId="left" type="monotone" dataKey="tokens" stroke="#1677ff" name="Token" strokeWidth={2} dot={false} />
                  <Line yAxisId="right" type="monotone" dataKey="requests" stroke="#52c41a" name="请求数" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </Card>
          )}

          {/* 模型 & 来源用量排行 */}
          <Row gutter={[16, 16]}>
            <Col xs={24} md={12}>
              <Card title="模型用量排行" size="small">
                <Table
                  dataSource={data.top_models}
                  rowKey="model_name"
                  pagination={false}
                  size="small"
                  columns={[
                    { title: "模型", dataIndex: "model_name", render: (v: string) => <ModelIcon modelName={v} /> },
                    { title: "调用次数", dataIndex: "requests", align: "right", render: (v: number) => formatNumber(v) },
                    { title: "Token", dataIndex: "tokens", align: "right", render: (v: number) => formatNumber(v) },
                    { title: "费用", dataIndex: "spend", align: "right", render: (v: number) => formatSpend(v) },
                  ]}
                />
              </Card>
            </Col>
            <Col xs={24} md={12}>
              <Card title="来源用量排行" size="small">
                <Table
                  dataSource={data.top_sources}
                  rowKey="source_tag"
                  pagination={false}
                  size="small"
                  columns={[
                    { title: "来源", dataIndex: "source_tag", render: (v: string) => <SourceIcon sourceTag={v} /> },
                    { title: "调用次数", dataIndex: "requests", align: "right", render: (v: number) => formatNumber(v) },
                    { title: "Token", dataIndex: "tokens", align: "right", render: (v: number) => formatNumber(v) },
                  ]}
                />
              </Card>
            </Col>
          </Row>
        </>
      ) : (
        <Empty description="暂无数据" />
      )}
    </div>
  );
}
