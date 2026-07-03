"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { Table, Switch, Select, DatePicker, Button, Empty } from "antd";
import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { logsApi, modelsApi } from "@/lib/api";
import { ModelIcon, SourceIcon } from "@/lib/icons";
import type { RequestLogItem, LogQueryParams } from "@/types";
import dayjs from "dayjs";
import "dayjs/locale/zh-cn";

dayjs.locale("zh-cn");

const LIVE_TAIL_INTERVAL_MS = 15_000;

const TIME_OPTIONS = [
  { label: "最近 15 分钟", value: "15m" },
  { label: "最近 1 小时", value: "1h" },
  { label: "最近 4 小时", value: "4h" },
  { label: "最近 24 小时", value: "24h" },
  { label: "最近 7 天", value: "7d" },
];

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}
function formatSpend(n: number): string {
  return `¥${n.toFixed(4)}`;
}

type SortField = "start_time" | "model_name" | "duration_ms" | "total_tokens" | "spend" | "tokens_per_second" | null;
type SortOrder = "asc" | "desc" | null;

export default function LogsPage() {
  const router = useRouter();

  const [page, setPage] = useState(1);
  const [pageSize] = useState(20);
  const [modelFilter, setModelFilter] = useState("");
  const [sourceFilter, setSourceFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [timeRange, setTimeRange] = useState("24h");
  const [customRange, setCustomRange] = useState<[string, string] | null>(null);
  const [showFilters, setShowFilters] = useState(false);
  const [isLiveTail, setIsLiveTail] = useState(true);
  const [sortConfig, setSortConfig] = useState<{ field: SortField; order: SortOrder }>({
    field: "start_time",
    order: "desc",
  });

  // 获取模型列表（供筛选下拉用）
  const { data: modelsData } = useQuery({
    queryKey: ["models-for-filter"],
    queryFn: () => modelsApi.list(),
  });
  const modelOptions = useMemo(() => {
    if (!modelsData?.models) return [];
    return modelsData.models.map((m: any) => ({ label: m.model_name, value: m.model_name }));
  }, [modelsData]);

  useEffect(() => {
    const stored = sessionStorage.getItem("logs-live-tail");
    if (stored !== null) setIsLiveTail(JSON.parse(stored));
  }, []);
  useEffect(() => {
    sessionStorage.setItem("logs-live-tail", JSON.stringify(isLiveTail));
  }, [isLiveTail]);

  const dateRange = useMemo((): [string, string] | null => {
    if (customRange) return customRange;
    const match = timeRange.match(/^(\d+)(m|h|d)$/);
    if (!match) return null;
    const [, num, unit] = match;
    const end = dayjs();
    const start = end.subtract(Number(num), unit === "m" ? "minute" : unit === "h" ? "hour" : "day");
    return [start.format("YYYY-MM-DD HH:mm:ss"), end.format("YYYY-MM-DD HH:mm:ss")];
  }, [timeRange, customRange]);

  const queryParams: LogQueryParams = {
    page,
    size: pageSize,
    ...(modelFilter && { model_name: modelFilter }),
    ...(sourceFilter && { source_tag: sourceFilter }),
    ...(statusFilter && { status: statusFilter }),
    ...(dateRange && { start_date: dateRange[0], end_date: dateRange[1] }),
  };

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["logs", queryParams],
    queryFn: () => logsApi.list(queryParams),
    placeholderData: keepPreviousData,
    refetchInterval: isLiveTail && page === 1 ? LIVE_TAIL_INTERVAL_MS : false,
    refetchIntervalInBackground: false,
  });

  const sortedLogs = useMemo(() => {
    if (!data?.logs) return [];
    const logs = [...data.logs];
    if (!sortConfig.field || !sortConfig.order) return logs;
    return logs.sort((a, b) => {
      let va: number, vb: number;
      switch (sortConfig.field) {
        case "start_time":
          va = new Date(a.start_time).getTime(); vb = new Date(b.start_time).getTime(); break;
        case "model_name":
          return sortConfig.order === "asc" ? a.model_name.localeCompare(b.model_name) : b.model_name.localeCompare(a.model_name);
        case "duration_ms": va = a.duration_ms; vb = b.duration_ms; break;
        case "total_tokens": va = a.total_tokens; vb = b.total_tokens; break;
        case "spend": va = a.spend; vb = b.spend; break;
        case "tokens_per_second": va = a.tokens_per_second; vb = b.tokens_per_second; break;
        default: return 0;
      }
      return sortConfig.order === "asc" ? va - vb : vb - va;
    });
  }, [data?.logs, sortConfig]);

  const handleSort = useCallback((field: SortField) => {
    setSortConfig((prev) => {
      if (prev.field === field) {
        if (prev.order === "desc") return { field, order: "asc" };
        if (prev.order === "asc") return { field: null, order: null };
        return { field, order: "desc" };
      }
      return { field, order: "desc" };
    });
  }, []);

  const sortIcon = (field: SortField) => {
    if (sortConfig.field !== field || !sortConfig.order) {
      return <span className="text-gray-300 ml-1 text-[11px]">↕</span>;
    }
    return (
      <span className="ml-1 text-[11px] font-bold" style={{ color: "#3b82f6" }}>
        {sortConfig.order === "asc" ? "↑" : "↓"}
      </span>
    );
  };

  const resetFilters = useCallback(() => {
    setModelFilter("");
    setSourceFilter("");
    setStatusFilter("");
    setTimeRange("24h");
    setCustomRange(null);
    setPage(1);
  }, []);

  const hasActiveFilters = modelFilter || sourceFilter || statusFilter || customRange;

  const total = data?.pagination.total || 0;
  const showingFrom = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const showingTo = Math.min(page * pageSize, total);
  const totalPages = Math.ceil(total / pageSize);

  const getTimeLabel = () => {
    return TIME_OPTIONS.find((o) => o.value === timeRange)?.label || "最近 24 小时";
  };

  const columns = [
    {
      title: <span onClick={() => handleSort("start_time")} className="cursor-pointer select-none">时间 {sortIcon("start_time")}</span>,
      dataIndex: "start_time",
      key: "start_time",
      width: 140,
      render: (v: string) => (
        <span className="text-[13px] text-gray-700">{dayjs(v).format("YYYY-MM-DD HH:mm:ss")}</span>
      ),
    },
    {
      title: <span onClick={() => handleSort("model_name")} className="cursor-pointer select-none">模型 {sortIcon("model_name")}</span>,
      dataIndex: "model_name",
      key: "model_name",
      width: 120,
      render: (v: string) => <ModelIcon modelName={v} />,
    },
    {
      title: "来源",
      dataIndex: "source_tag",
      key: "source_tag",
      width: 120,
      render: (v: string) => <SourceIcon sourceTag={v} />,
    },
    {
      title: "状态",
      dataIndex: "status",
      key: "status",
      width: 80,
      render: (v: string) => {
        const isSuccess = v === "success";
        return (
          <span
            className={`px-2 py-1 rounded-md text-xs font-medium inline-block text-center w-16 ${
              isSuccess ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"
            }`}
          >
            {isSuccess ? "Success" : "Failure"}
          </span>
        );
      },
    },
    {
      title: <span onClick={() => handleSort("duration_ms")} className="cursor-pointer select-none">耗时 {sortIcon("duration_ms")}</span>,
      dataIndex: "duration_ms",
      key: "duration_ms",
      width: 80,
      align: "right" as const,
      render: (v: number) => <span className="text-[13px]">{formatDuration(v)}</span>,
    },
    {
      title: "TTFT",
      dataIndex: "completion_start_time",
      key: "ttft",
      width: 90,
      align: "right" as const,
      render: (v: string | null, record: RequestLogItem) => {
        if (!v) return <span className="text-gray-400">-</span>;
        const start = new Date(record.start_time).getTime();
        const first = new Date(v).getTime();
        return <span className="text-[13px]">{formatDuration(first - start)}</span>;
      },
    },
    {
      title: <span onClick={() => handleSort("tokens_per_second")} className="cursor-pointer select-none">Token/s {sortIcon("tokens_per_second")}</span>,
      dataIndex: "tokens_per_second",
      key: "tokens_per_second",
      width: 90,
      align: "right" as const,
      render: (v: number) => <span className="text-[13px]">{v > 0 ? v.toFixed(1) : "-"}</span>,
    },
    {
      title: "缓存",
      dataIndex: "cache_hit",
      key: "cache_hit",
      width: 90,
      align: "right" as const,
      render: (_: string | null, record: RequestLogItem) =>
        record.cache_hit && record.cached_tokens > 0 ? (
          <span className="text-[13px]">
            <span className="text-green-600">{record.cached_tokens}</span>
            <span className="text-[12px]">({record.prompt_tokens})</span>
          </span>
        ) : (
          <span className="text-gray-400">-</span>
        ),
    },
    {
      title: <span onClick={() => handleSort("total_tokens")} className="cursor-pointer select-none">Token {sortIcon("total_tokens")}</span>,
      dataIndex: "total_tokens",
      key: "total_tokens",
      width: 120,
      align: "right" as const,
      render: (_: number, record: RequestLogItem) => (
        <span className="text-[13px]">
          {record.total_tokens}
          <span className="text-gray-400 text-[12px]"> ({record.prompt_tokens}+{record.completion_tokens})</span>
        </span>
      ),
    },
    {
      title: <span onClick={() => handleSort("spend")} className="cursor-pointer select-none">费用 {sortIcon("spend")}</span>,
      dataIndex: "spend",
      key: "spend",
      width: 120,
      align: "right" as const,
      render: (v: number) => <span className="text-[13px]">{formatSpend(v)}</span>,
    },
    {
      title: "操作",
      key: "actions",
      width: 70,
      align: "right" as const,
      render: (_: any, record: RequestLogItem) => (
        <button
          className="text-blue-500 hover:text-blue-700 text-[13px] bg-transparent border-none cursor-pointer p-0"
          onClick={(e) => { e.stopPropagation(); router.push(`/logs/detail?id=${record.id}`); }}
        >
          详情
        </button>
      ),
    },
  ];

  return (
    <div className="w-full p-6 overflow-x-hidden box-border">
      {/* ── 标题 ── */}
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-semibold">请求日志</h1>
      </div>

      {/* ── 筛选按钮行（LiteLLM FilterComponent 样式） ── */}
      <div className="flex items-center gap-2 mb-6">
        <Button
          className="flex items-center gap-1"
          onClick={() => setShowFilters(!showFilters)}
        >
          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
          </svg>
          过滤
        </Button>
        <Button onClick={resetFilters}>重置过滤</Button>
      </div>

      {/* ── 筛选面板（LiteLLM grid-cols-3 样式） ── */}
      {showFilters && (
        <div className="grid grid-cols-4 gap-x-6 gap-y-4 mb-6">
          <div className="flex flex-col gap-2">
            <label className="text-sm text-gray-600">模型名称</label>
            <Select
              showSearch
              className="w-full"
              placeholder="搜索模型..."
              value={modelFilter || undefined}
              onChange={(v) => { setModelFilter(v || ""); setPage(1); }}
              allowClear
              options={modelOptions}
              filterOption={(input, option) =>
                (option?.label ?? "").toLowerCase().includes(input.toLowerCase())
              }
            />
          </div>
          <div className="flex flex-col gap-2">
            <label className="text-sm text-gray-600">来源标签</label>
            <Select
              className="w-full"
              placeholder="选择来源..."
              value={sourceFilter || undefined}
              onChange={(v) => { setSourceFilter(v || ""); setPage(1); }}
              allowClear
              options={[
                { label: "copilot", value: "copilot" },
                { label: "curl", value: "curl" },
                { label: "node", value: "node" },
                { label: "unknown", value: "unknown" },
              ]}
            />
          </div>
          <div className="flex flex-col gap-2">
            <label className="text-sm text-gray-600">状态</label>
            <Select
              className="w-full"
              placeholder="选择状态..."
              value={statusFilter || undefined}
              onChange={(v) => { setStatusFilter(v || ""); setPage(1); }}
              allowClear
              options={[
                { label: "Success", value: "success" },
                { label: "Failure", value: "error" },
              ]}
            />
          </div>
          <div className="flex flex-col gap-2">
            <label className="text-sm text-gray-600">时间范围</label>
            <DatePicker.RangePicker
              showTime
              className="w-full"
              onChange={(dates) => {
                if (dates && dates[0] && dates[1]) {
                  setCustomRange([dates[0].format("YYYY-MM-DD HH:mm:ss"), dates[1].format("YYYY-MM-DD HH:mm:ss")]);
                  setTimeRange("custom");
                } else {
                  setCustomRange(null);
                  setTimeRange("24h");
                }
                setPage(1);
              }}
              placeholder={["开始时间", "结束时间"]}
            />
          </div>
        </div>
      )}

      {/* ── 白色卡片容器（LiteLLM bg-white rounded-lg shadow） ── */}
      <div className="bg-white rounded-lg shadow w-full max-w-full box-border">
        {/* ── 工具栏（LiteLLM border-b px-6 py-4） ── */}
        <div className="border-b px-6 py-4 w-full max-w-full box-border">
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between space-y-4 md:space-y-0 w-full max-w-full box-border">
            <div className="flex flex-wrap items-center gap-3 w-full max-w-full box-border">
              <div className="flex items-center gap-2 min-w-0 flex-shrink">
                <Select
                  value={timeRange}
                  onChange={(v) => { setTimeRange(v); setCustomRange(null); setPage(1); }}
                  style={{ width: 160 }}
                  options={TIME_OPTIONS}
                  size="middle"
                />

                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-gray-900">自动刷新</span>
                  <Switch size="small" checked={isLiveTail} onChange={setIsLiveTail} />
                </div>

                <Button
                  type="default"
                  icon={
                    <svg className={`w-4 h-4 ${isFetching && !isLiveTail ? "animate-spin" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                  }
                  onClick={() => refetch()}
                  disabled={isFetching && !isLiveTail}
                >
                  {isFetching && !isLiveTail ? "加载中..." : "获取"}
                </Button>
              </div>
            </div>

            <div className="flex items-center space-x-4">
              <span className="text-sm text-gray-700 whitespace-nowrap">
                显示 {showingFrom} - {showingTo}，共 {total} 条结果
              </span>
              <div className="flex items-center space-x-2">
                <span className="text-sm text-gray-700 whitespace-nowrap">
                  第 {page} / {totalPages || 1} 页
                </span>
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1}
                  className="px-5 py-1.5 text-sm border rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
                >
                  上一页
                </button>
                <button
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page >= totalPages}
                  className="px-5 py-1.5 text-sm border rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
                >
                  下一页
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* ── Live Tail 横幅（LiteLLM mb-4 px-4 py-2 bg-green-50 border border-green-200 rounded-md） ── */}
        {isLiveTail && page === 1 && (
          <div className="my-3 px-4 py-2 bg-green-50 border border-green-200 rounded-lg flex items-center justify-between">
            <span className="text-sm text-green-700">每 15 秒自动刷新</span>
            <button
              onClick={() => setIsLiveTail(false)}
              className="text-sm text-green-600 hover:text-green-800"
            >
              停止
            </button>
          </div>
        )}

        {/* ── 数据表格（LiteLLM custom-border 样式） ── */}
        <div className="rounded-lg custom-border overflow-x-auto w-full max-w-full box-border">
          <Table
            dataSource={sortedLogs}
            columns={columns}
            rowKey="id"
            loading={isLoading}
            size="small"
            scroll={{ x: 1400 }}
            pagination={false}
            className="ant-table-compact"
            locale={{ emptyText: <Empty description="暂无日志记录" /> }}
            onRow={(record) => ({
              onClick: () => router.push(`/logs/detail?id=${record.id}`),
              className: "cursor-pointer hover:bg-gray-50",
            })}
          />
        </div>
      </div>
    </div>
  );
}
