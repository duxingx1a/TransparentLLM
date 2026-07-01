"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Card,
  Table,
  Tag,
  Typography,
  Space,
  Select,
  DatePicker,
  Button,
  Input,
  Row,
  Col,
  Empty,
} from "antd";
import {
  SearchOutlined,
  ReloadOutlined,
  EyeOutlined,
} from "@ant-design/icons";
import { useQuery } from "@tanstack/react-query";
import { logsApi } from "@/lib/api";
import { ModelIcon, SourceIcon } from "@/lib/icons";
import type { RequestLogItem, LogQueryParams } from "@/types";
import dayjs from "dayjs";

const { Title, Text } = Typography;
const { RangePicker } = DatePicker;

/** 格式化耗时 */
function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

/** 格式化金额 */
function formatSpend(n: number): string {
  return `¥${n.toFixed(4)}`;
}

export default function LogsPage() {
  const router = useRouter();

  // 筛选条件
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [modelFilter, setModelFilter] = useState("");
  const [sourceFilter, setSourceFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [dateRange, setDateRange] = useState<[string, string] | null>(null);

  const queryParams: LogQueryParams = {
    page,
    size: pageSize,
    ...(modelFilter && { model: modelFilter }),
    ...(sourceFilter && { source: sourceFilter }),
    ...(statusFilter && { status: statusFilter }),
    ...(dateRange && { from: dateRange[0], to: dateRange[1] }),
  };

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["logs", queryParams],
    queryFn: () => logsApi.list(queryParams),
  });

  const columns = [
    {
      title: "时间",
      dataIndex: "start_time",
      key: "start_time",
      width: 170,
      render: (v: string) => dayjs(v).format("MM-DD HH:mm:ss"),
    },
    { title: "模型", dataIndex: "model_name", key: "model_name", width: 150,
      render: (v: string) => <ModelIcon modelName={v} /> },
    {
      title: "来源",
      dataIndex: "source_tag",
      key: "source_tag",
      width: 130,
      render: (v: string) => <SourceIcon sourceTag={v} />,
    },
    {
      title: "状态",
      dataIndex: "status",
      key: "status",
      width: 80,
      render: (v: string) => (
        <Tag color={v === "success" ? "green" : "red"}>{v}</Tag>
      ),
    },
    {
      title: "耗时",
      dataIndex: "duration_ms",
      key: "duration_ms",
      width: 90,
      align: "right" as const,
      render: (v: number) => formatDuration(v),
    },
    {
      title: "TTFT",
      dataIndex: "completion_start_time",
      key: "ttft",
      width: 80,
      align: "right" as const,
      render: (v: string | null, record: RequestLogItem) => {
        if (!v) return "-";
        const start = new Date(record.start_time).getTime();
        const first = new Date(v).getTime();
        return formatDuration(first - start);
      },
    },
    {
      title: "Token",
      dataIndex: "total_tokens",
      key: "total_tokens",
      width: 130,
      align: "right" as const,
      render: (_: number, record: RequestLogItem) => (
        <span>
          {record.total_tokens}
          <span style={{ color: "#999", fontSize: 12 }}>
            ({record.prompt_tokens}+{record.completion_tokens})
          </span>
        </span>
      ),
    },
    {
      title: "费用",
      dataIndex: "spend",
      key: "spend",
      width: 120,
      render: (v: number) => formatSpend(v),
    },
    {
      title: "缓存",
      dataIndex: "cache_hit",
      key: "cache_hit",
      width: 70,
      render: (v: string | null) =>
        v ? <Tag color="gold">命中</Tag> : null,
    },
    {
      title: "操作",
      key: "actions",
      width: 80,
      render: (_: any, record: RequestLogItem) => (
        <Button
          type="link"
          size="small"
          icon={<EyeOutlined />}
          onClick={() => router.push(`/logs/detail?id=${record.id}`)}
        >
          详情
        </Button>
      ),
    },
  ];

  return (
    <div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 24,
        }}
      >
        <Title level={4} style={{ margin: 0 }}>
          请求日志
        </Title>
        <Button icon={<ReloadOutlined />} onClick={() => refetch()}>
          刷新
        </Button>
      </div>

      {/* 筛选栏 */}
      <Card size="small" style={{ marginBottom: 16 }}>
        <Row gutter={[12, 12]} align="middle">
          <Col xs={24} sm={12} md={6}>
            <Input
              placeholder="模型名称"
              value={modelFilter}
              onChange={(e) => {
                setModelFilter(e.target.value);
                setPage(1);
              }}
              allowClear
              prefix={<SearchOutlined />}
            />
          </Col>
          <Col xs={24} sm={12} md={6}>
            <Input
              placeholder="来源标签"
              value={sourceFilter}
              onChange={(e) => {
                setSourceFilter(e.target.value);
                setPage(1);
              }}
              allowClear
              prefix={<SearchOutlined />}
            />
          </Col>
          <Col xs={24} sm={12} md={4}>
            <Select
              placeholder="状态"
              value={statusFilter || undefined}
              onChange={(v) => {
                setStatusFilter(v || "");
                setPage(1);
              }}
              allowClear
              style={{ width: "100%" }}
              options={[
                { label: "成功", value: "success" },
                { label: "失败", value: "error" },
              ]}
            />
          </Col>
          <Col xs={24} sm={12} md={8}>
            <RangePicker
              style={{ width: "100%" }}
              onChange={(dates) => {
                if (dates && dates[0] && dates[1]) {
                  setDateRange([
                    dates[0].format("YYYY-MM-DD"),
                    dates[1].format("YYYY-MM-DD"),
                  ]);
                } else {
                  setDateRange(null);
                }
                setPage(1);
              }}
              placeholder={["开始日期", "结束日期"]}
            />
          </Col>
        </Row>
      </Card>

      {/* 日志表格 */}
      <Card style={{ border: "1px solid #f0f0f0" }} styles={{ body: { padding: 0 } }}>
      <Table
        dataSource={data?.logs || []}
        columns={columns}
        rowKey="id"
        loading={isLoading}
        size="small"
        scroll={{ x: 1100 }}
        pagination={{
          current: page,
          pageSize: pageSize,
          total: data?.pagination.total || 0,
          showSizeChanger: true,
          showTotal: (total) => `共 ${total} 条`,
          onChange: (p, ps) => {
            setPage(p);
            setPageSize(ps);
          },
        }}
        locale={{ emptyText: <Empty description="暂无日志记录" /> }}
      />
      </Card>
    </div>
  );
}
