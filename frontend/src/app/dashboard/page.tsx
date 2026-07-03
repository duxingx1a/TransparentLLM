"use client";

import React, { useState, useMemo } from "react";
import {
  Card, Col, Row, Statistic, Table, Spin, Typography, Empty, Select,
  DatePicker, Space, Segmented, theme,
} from "antd";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, Cell,
} from "recharts";
import { useQuery } from "@tanstack/react-query";
import { statsApi } from "@/lib/api";
import { ModelIcon, SourceIcon } from "@/lib/icons";
import type { DashboardOverview } from "@/types";
import dayjs from "dayjs";

const { Title, Text } = Typography;
const { useToken } = theme;

// 模型配色（最多 10 个模型）
const MODEL_COLORS = [
  "#1677ff", "#52c41a", "#faad14", "#ff4d4f", "#722ed1",
  "#13c2c2", "#eb2f96", "#fa8c16", "#2f54eb", "#a0d911",
];

// 时间范围选项
const timeRangeOptions = [
  { label: "7 天", value: "7d" },
  { label: "14 天", value: "14d" },
  { label: "30 天", value: "30d" },
];

// 图表类型
type ChartType = "requests" | "tokens" | "spend";

const chartTypeOptions = [
  { label: "请求次数", value: "requests" },
  { label: "Token 用量", value: "tokens" },
  { label: "费用", value: "spend" },
];

function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function formatSpend(n: number): string {
  return `¥${n.toFixed(4)}`;
}

function formatYAxis(value: number, chartType: ChartType): string {
  if (chartType === "spend") return `¥${value.toFixed(2)}`;
  return formatNumber(value);
}

export default function DashboardPage() {
  const { token } = useToken();
  const [timeRange, setTimeRange] = useState("7d");
  const [chartType, setChartType] = useState<ChartType>("tokens");

  const { data, isLoading } = useQuery<DashboardOverview>({
    queryKey: ["dashboard-overview", timeRange],
    queryFn: () => statsApi.overview(),
  });

  // 将 daily_by_model 转换为堆叠柱状图数据
  const stackedData = useMemo(() => {
    if (!data?.daily_by_model?.length) return [];

    // 收集所有日期和模型
    const dateSet = new Set<string>();
    const modelSet = new Set<string>();
    data.daily_by_model.forEach((d) => {
      dateSet.add(d.date);
      modelSet.add(d.model_name);
    });

    const dates = Array.from(dateSet).sort();
    const models = Array.from(modelSet);

    // 按日期聚合
    return dates.map((date) => {
      const row: Record<string, string | number> = { date };
      models.forEach((model) => {
        const entry = data.daily_by_model.find(
          (d) => d.date === date && d.model_name === model
        );
        row[model] = entry ? entry[chartType] : 0;
      });
      return row;
    });
  }, [data, chartType]);

  // 获取所有模型名（用于 legend 和 bar）
  const allModels = useMemo(() => {
    if (!data?.daily_by_model) return [];
    return Array.from(new Set(data.daily_by_model.map((d) => d.model_name)));
  }, [data]);

  // 截断日期显示 (07-01 → 7/1)
  const formatDate = (d: string) => {
    const m = dayjs(d);
    return `${m.month() + 1}/${m.date()}`;
  };

  const chartTitle =
    chartType === "requests"
      ? "每日请求次数（按模型）"
      : chartType === "tokens"
        ? "每日 Token 用量（按模型）"
        : "每日费用（按模型）";

  return (
    <div>
      {/* 标题栏 */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 24,
        }}
      >
        <Title level={4} style={{ margin: 0 }}>用量总览</Title>
        <Space>
          <Select
            value={timeRange}
            onChange={setTimeRange}
            options={timeRangeOptions}
            style={{ width: 100 }}
          />
        </Space>
      </div>

      {isLoading ? (
        <div style={{ textAlign: "center", padding: 60 }}>
          <Spin size="large" />
        </div>
      ) : data ? (
        <>
          {/* ── 概览卡片 ── */}
          <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
            <Col xs={12} sm={6}>
              <Card size="small" styles={{ body: { padding: "16px 20px" } }}>
                <Statistic
                  title="今日请求"
                  value={data.today.total_requests}
                  valueStyle={{ fontSize: 24 }}
                />
              </Card>
            </Col>
            <Col xs={12} sm={6}>
              <Card size="small" styles={{ body: { padding: "16px 20px" } }}>
                <Statistic
                  title="今日 Token"
                  value={formatNumber(data.today.total_tokens)}
                  valueStyle={{ fontSize: 24, color: "#1677ff" }}
                />
              </Card>
            </Col>
            <Col xs={12} sm={6}>
              <Card size="small" styles={{ body: { padding: "16px 20px" } }}>
                <Statistic
                  title="今日费用"
                  value={formatSpend(data.today.total_spend)}
                  valueStyle={{ fontSize: 24, color: "#faad14" }}
                />
              </Card>
            </Col>
            <Col xs={12} sm={6}>
              <Card size="small" styles={{ body: { padding: "16px 20px" } }}>
                <Statistic
                  title="累计费用"
                  value={formatSpend(data.total.total_spend)}
                  valueStyle={{ fontSize: 24 }}
                />
              </Card>
            </Col>
          </Row>

          {/* ── 堆叠柱状图 ── */}
          {stackedData.length > 0 && (
            <Card
              size="small"
              style={{ marginBottom: 24 }}
              title={
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    width: "100%",
                  }}
                >
                  <span>{chartTitle}</span>
                  <Segmented
                    size="small"
                    value={chartType}
                    onChange={(v) => setChartType(v as ChartType)}
                    options={chartTypeOptions}
                  />
                </div>
              }
            >
              <ResponsiveContainer width="100%" height={320}>
                <BarChart data={stackedData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis
                    dataKey="date"
                    tickFormatter={formatDate}
                    tick={{ fontSize: 12 }}
                    interval="preserveStartEnd"
                  />
                  <YAxis
                    tickFormatter={(v) => formatYAxis(v, chartType)}
                    tick={{ fontSize: 12 }}
                    width={65}
                  />
                  <Tooltip
                    formatter={(value: number, name: string) =>
                      chartType === "spend"
                        ? [`¥${value.toFixed(4)}`, name]
                        : [formatNumber(value), name]
                    }
                    labelFormatter={(label: string) => dayjs(label).format("MM-DD")}
                  />
                  <Legend
                    wrapperStyle={{ fontSize: 12, paddingTop: 8 }}
                    formatter={(value: string) =>
                      value.length > 16 ? value.slice(0, 16) + "…" : value
                    }
                  />
                  {allModels.map((model, i) => (
                    <Bar
                      key={model}
                      dataKey={model}
                      stackId="a"
                      fill={MODEL_COLORS[i % MODEL_COLORS.length]}
                      radius={
                        i === allModels.length - 1 ? [2, 2, 0, 0] : [0, 0, 0, 0]
                      }
                    />
                  ))}
                </BarChart>
              </ResponsiveContainer>
            </Card>
          )}

          {/* ── 模型排行 & 来源排行 ── */}
          <Row gutter={[16, 16]}>
            <Col xs={24} md={12}>
              <Card title="模型用量排行" size="small">
                <Table
                  dataSource={data.top_models}
                  rowKey="model_name"
                  pagination={false}
                  size="small"
                  columns={[
                    {
                      title: "模型",
                      dataIndex: "model_name",
                      render: (v: string) => <ModelIcon modelName={v} />,
                    },
                    {
                      title: "调用次数",
                      dataIndex: "requests",
                      align: "right",
                      render: (v: number) => formatNumber(v),
                    },
                    {
                      title: "Token",
                      dataIndex: "tokens",
                      align: "right",
                      render: (v: number) => formatNumber(v),
                    },
                    {
                      title: "费用",
                      dataIndex: "spend",
                      align: "right",
                      render: (v: number) => formatSpend(v),
                    },
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
                    {
                      title: "来源",
                      dataIndex: "source_tag",
                      render: (v: string) => <SourceIcon sourceTag={v} />,
                    },
                    {
                      title: "调用次数",
                      dataIndex: "requests",
                      align: "right",
                      render: (v: number) => formatNumber(v),
                    },
                    {
                      title: "Token",
                      dataIndex: "tokens",
                      align: "right",
                      render: (v: number) => formatNumber(v),
                    },
                    {
                      title: "费用",
                      dataIndex: "spend",
                      align: "right",
                      render: (v: number) => formatSpend(v),
                    },
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
