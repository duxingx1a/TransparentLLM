"use client";

import React, { useState, useMemo } from "react";
import { Table, DatePicker, Empty, ConfigProvider } from "antd";
import zhCN from "antd/locale/zh_CN";
import { AreaChart, Area } from "@/components/charts/area-chart";
import { Grid } from "@/components/charts/grid";
import { XAxis } from "@/components/charts/x-axis";
import { ChartTooltip } from "@/components/charts/tooltip";
import { useYScale, useChartStable, useChart } from "@/components/charts/chart-context";
import { useQuery } from "@tanstack/react-query";
import { statsApi } from "@/lib/api";
import { ModelIcon, SourceIcon } from "@/lib/icons";
import type { DashboardOverview } from "@/types";
import dayjs from "dayjs";
import "dayjs/locale/zh-cn";
dayjs.locale("zh-cn");

const MODEL_COLORS = [
  "#FF6347", "#FF8042", "#0088FE", "#00C49F",
  "#8B5CF6", "#EC4899", "#84CC16", "#6366F1",
];

const TIME_OPTIONS = [
  { label: "全部", value: "all" },
  { label: "最近 1 天", value: "1d" },
  { label: "最近 7 天", value: "7d" },
  { label: "最近 30 天", value: "30d" },
];

type ChartType = "requests" | "tokens" | "spend";

const CHART_OPTIONS = [
  { label: "请求次数", value: "requests" },
  { label: "Token 用量", value: "tokens" },
  { label: "费用", value: "spend" },
];

function formatNumber(n: number): string {
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)}B`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function formatSpend(n: number): string {
  if (n >= 10000) return `¥${(n / 10000).toFixed(1)}万`;
  if (n >= 1000) return `¥${(n / 1000).toFixed(1)}K`;
  return `¥${n.toFixed(2)}`;
}



function StatCard({ label, value, sub, color }: { label: string; value: string; sub: string; color: string }) {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
      <div className="text-sm font-semibold text-gray-900 mb-1">{label}</div>
      <div className="text-2xl font-bold" style={{ color }}>{value}</div>
      <div className="text-xs text-gray-400 mt-2 leading-relaxed">{sub}</div>
    </div>
  );
}

/** 自定义纵坐标 — 在图表 SVG 内渲染，标记为 clip-excluded */
function DashboardYAxis({ formatTick }: { formatTick?: (v: number) => string }) {
  const yScale = useYScale();
  const { innerHeight, margin } = useChartStable();
  const ticks = yScale.ticks ? yScale.ticks(5) : [];
  const x = -(margin.left - 8);
  return (
    <>
      {ticks.map((tick) => {
        const y = yScale(tick);
        const label = formatTick ? formatTick(tick) : formatNumber(tick);
        return (
          <text key={tick} x={x} y={y + 4} textAnchor="end" fontSize={11} fill="#9CA3AF" fontFamily="system-ui">
            {label}
          </text>
        );
      })}
    </>
  );
}
// 标记为 clip-excluded，使图表不裁剪它
(DashboardYAxis as any).displayName = "YAxis";

/** 图表区域 hover 叠加层 — 根据鼠标 Y 坐标识别堆叠层 */
function ChartHoverOverlay({ models, onModelHover }: {
  models: string[];
  onModelHover: (model: string | null) => void;
}) {
  const { data, renderData, xScale, innerWidth, innerHeight } = useChart();
  const yScale = useYScale();
  const { margin } = useChartStable();

  // 当 tooltip 数据变化时，根据鼠标位置判断 hover 哪个层
  const handleMouseMove = (e: React.MouseEvent<SVGGElement>) => {
    if (!data.length || !models.length) return;
    const svgEl = (e.currentTarget as SVGElement).closest("svg");
    if (!svgEl) return;
    const point = svgEl.createSVGPoint();
    point.x = e.clientX;
    point.y = e.clientY;
    const svgPoint = point.matrixTransform(svgEl.getScreenCTM()!.inverse());
    // svgPoint 在 SVG 根坐标系，减去 margin 得到 plot area 坐标
    const mouseX = svgPoint.x - margin.left;
    const mouseY = svgPoint.y - margin.top;
    if (mouseX < 0 || mouseX > innerWidth || mouseY < 0 || mouseY > innerHeight) {
      onModelHover(null);
      return;
    }
    // 找到最近的数据点索引
    const x0 = xScale.invert(mouseX);
    const bisect = (arr: Record<string, unknown>[], date: Date) => {
      let lo = 0, hi = arr.length;
      while (lo < hi) {
        const mid = (lo + hi) >> 1;
        const d = arr[mid]?.date;
        const dDate = d instanceof Date ? d : new Date(d as string);
        if (dDate < date) lo = mid + 1; else hi = mid;
      }
      return lo;
    };
    const idx = Math.min(bisect(renderData, x0), renderData.length - 1);
    if (idx < 0) return;
    const pointData = renderData[idx];
    if (!pointData) return;
    // 计算该 X 位置各模型的值，从顶层往下查找（堆叠：从大到小累加）
    const mouseYValue = yScale.invert(mouseY);
    // trendModels[0] 是最大的，其累计值就是最顶层的 y 值
    // 从顶层往下找：检查 mouseYValue 是否在 [prevCumul, cumul] 之间
    let prevCumul = 0;
    for (let i = 0; i < models.length; i++) {
      const model = models[i];
      const cumul = Number(pointData[model] ?? 0);
      if (mouseYValue >= prevCumul && mouseYValue <= cumul) {
        onModelHover(model);
        return;
      }
      prevCumul = cumul;
    }
    onModelHover(null);
  };

  const handleMouseLeave = () => onModelHover(null);

  return (
    <rect
      fill="transparent"
      height={innerHeight}
      width={innerWidth}
      x={0}
      y={0}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      style={{ cursor: "crosshair" }}
    />
  );
}

/** 根据当前时间范围生成卡片标签前缀 */
function getTimeLabel(timeRange: string, customRange: [string, string] | null): string {
  if (timeRange === "all") return "全部";
  if (timeRange === "1d") return "最近一天";
  if (timeRange === "7d") return "最近七天";
  if (timeRange === "30d") return "最近三十天";
  if (timeRange === "custom" && customRange) {
    return `${customRange[0].slice(5)} ~ ${customRange[1].slice(5)}`;
  }
  return "筛选";
}

export default function DashboardPage() {
  const [timeRange, setTimeRange] = useState("1d");
  const [chartType, setChartType] = useState<ChartType>("tokens");
  const [customRange, setCustomRange] = useState<[string, string] | null>(null);
  const [hoveredModel, setHoveredModel] = useState<string | null>(null);

  const dateRange = useMemo(() => {
    if (customRange) return customRange;
    if (timeRange === "all") return null;
    const match = timeRange.match(/^(\d+)(d)$/);
    if (!match) return null;
    const days = parseInt(match[1]);
    const end = dayjs();
    const start = end.subtract(days, "day");
    return [start.format("YYYY-MM-DD"), end.format("YYYY-MM-DD")];
  }, [timeRange, customRange]);

  const { data, isLoading, refetch } = useQuery<DashboardOverview>({
    queryKey: ["dashboard-overview"],
    queryFn: () => statsApi.overview(),
    refetchInterval: 10_000,
  });

  // 获取每日明细数据（含 source_tag），用于来源排行按时间过滤
  const { data: dailyData } = useQuery({
    queryKey: ["stats-daily-all"],
    queryFn: () => statsApi.daily({}),
  });



  const filteredByModel = useMemo(() => {
    if (!data?.daily_by_model?.length) return [];
    if (!dateRange) return data.daily_by_model;
    return data.daily_by_model.filter((d) => d.date >= dateRange[0] && d.date <= dateRange[1]);
  }, [data, dateRange]);

  // 趋势图用的模型（按总量排序取前5）
  const trendModels = useMemo(() => {
    if (!filteredByModel.length) return [];
    const totals = new Map<string, number>();
    data?.daily_by_model?.forEach((d) => {
      totals.set(d.model_name, (totals.get(d.model_name) || 0) + d.tokens);
    });
    return Array.from(totals.entries()).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([name]) => name);
  }, [data, filteredByModel]);

  // 趋势图堆叠数据：按 chartType 切换聚合字段，计算累计值用于堆叠
  const trendStackedData = useMemo(() => {
    if (!dailyData?.daily?.length || !trendModels.length) return [];
    // 1. 先算每天各模型的原始值
    const dateMap = new Map<string, Record<string, number>>();
    dailyData.daily.forEach((d) => {
      if (!dateMap.has(d.date)) dateMap.set(d.date, {});
      const row = dateMap.get(d.date)!;
      const val = chartType === "requests" ? d.total_requests : chartType === "spend" ? d.total_spend : d.total_tokens;
      row[d.model_name] = (row[d.model_name] || 0) + val;
    });
    // 2. 按 trendModels 顺序（从大到小）计算累计值和底部基线
    const dates = Array.from(dateMap.keys()).sort();
    return dates.map((date) => {
      const raw = dateMap.get(date)!;
      const stacked: Record<string, string | number> = { date };
      let cumul = 0;
      for (const model of trendModels) {
        const v = raw[model] || 0;
        stacked[`${model}_base`] = cumul;   // 底部累计值
        cumul += v;
        stacked[model] = cumul;              // 顶部累计值
      }
      return stacked;
    });
  }, [dailyData, chartType, trendModels]);



  const filteredTopModels = useMemo(() => {
    if (!data?.top_models) return [];
    if (!dateRange) return data.top_models;
    const modelMap = new Map<string, { requests: number; tokens: number; spend: number }>();
    filteredByModel.forEach((d) => {
      const existing = modelMap.get(d.model_name) || { requests: 0, tokens: 0, spend: 0 };
      existing.requests += d.requests;
      existing.tokens += d.tokens;
      existing.spend += d.spend;
      modelMap.set(d.model_name, existing);
    });
    return Array.from(modelMap.entries())
      .map(([model_name, v]) => ({ model_name, ...v }))
      .sort((a, b) => b.spend - a.spend);
  }, [data, filteredByModel, dateRange]);

  const filteredBySource = useMemo(() => {
    // 优先使用 overview 返回的 daily_by_source（需后端更新后生效）
    const sourceData = data?.daily_by_source;
    if (sourceData?.length) {
      if (!dateRange) return sourceData;
      return sourceData.filter((d) => d.date >= dateRange[0] && d.date <= dateRange[1]);
    }
    // 后备：从 daily 明细接口获取 source 数据并按日期过滤
    if (dailyData?.daily?.length) {
      const filtered = dateRange
        ? dailyData.daily.filter((d) => d.date >= dateRange[0] && d.date <= dateRange[1])
        : dailyData.daily;
      return filtered.map((d) => ({
        date: d.date,
        source_tag: d.source_tag,
        requests: d.total_requests,
        tokens: d.total_tokens,
        spend: d.total_spend,
        cached_tokens: d.cache_hits,
      }));
    }
    return [];
  }, [data, dailyData, dateRange]);

  const filteredTopSources = useMemo(() => {
    // 优先使用按日期过滤后的 daily_by_source 数据
    if (filteredBySource.length) {
      const sourceMap = new Map<string, { requests: number; tokens: number; spend: number; cached_tokens: number }>();
      filteredBySource.forEach((d) => {
        const existing = sourceMap.get(d.source_tag) || { requests: 0, tokens: 0, spend: 0, cached_tokens: 0 };
        existing.requests += d.requests;
        existing.tokens += d.tokens;
        existing.spend += d.spend;
        existing.cached_tokens += d.cached_tokens;
        sourceMap.set(d.source_tag, existing);
      });
      return Array.from(sourceMap.entries())
        .map(([source_tag, v]) => ({ source_tag, ...v }))
        .sort((a, b) => b.requests - a.requests);
    }
    // 后备：使用全局 top_sources
    if (!data?.top_sources) return [];
    return data.top_sources;
  }, [data, filteredBySource]);

  const filteredStats = useMemo(() => {
    if (!dateRange || !data?.daily_by_model?.length) {
      return {
        total_requests: data?.total?.total_requests ?? 0,
        failed_requests: data?.total?.failed_requests ?? 0,
        total_tokens: data?.total?.total_tokens ?? 0,
        cached_tokens: data?.total?.cached_tokens ?? 0,
        prompt_tokens: data?.total?.prompt_tokens ?? 0,
        completion_tokens: data?.total?.completion_tokens ?? 0,
        total_spend: data?.total?.total_spend ?? 0,
      };
    }
    let r = 0, t = 0, ct = 0, pt = 0, cot = 0, s = 0;
    filteredByModel.forEach((d) => { r += d.requests; t += d.tokens; ct += d.cached_tokens; pt += d.tokens; s += d.spend; });
    return { total_requests: r, failed_requests: 0, total_tokens: t, cached_tokens: ct, prompt_tokens: pt, completion_tokens: cot, total_spend: s };
  }, [data, filteredByModel, dateRange]);



  return (
    <div className="w-full p-6 overflow-x-hidden box-border">
      <h1 className="text-xl font-semibold mb-6">用量总览</h1>

      {isLoading ? (
        <div className="text-center py-16 text-gray-400">加载中...</div>
      ) : data ? (
        <>
          {/* 最顶部：永久总计 3张卡片 */}
          <div className="grid grid-cols-3 gap-4 mb-6">
            <StatCard label="总花费" value={formatSpend(data.total.total_spend)} color="#3B82F6"
              sub={`${formatSpend(data.total.total_spend * 0.1)} 缓存 + ${formatSpend(data.total.total_spend * 0.3)} 输入 + ${formatSpend(data.total.total_spend * 0.6)} 输出`} />
            <StatCard label="总 Token" value={formatNumber(data.total.total_tokens)} color="#3CB4D9"
              sub={`${formatNumber(data.total.cached_tokens)} 缓存 + ${formatNumber(data.total.prompt_tokens - data.total.cached_tokens)} 输入 + ${formatNumber(data.total.completion_tokens)} 输出`} />
            <StatCard label="总请求" value={formatNumber(data.total.total_requests)} color="#10B981"
              sub={`${formatNumber(data.total.total_requests - data.total.failed_requests)} 成功 + ${formatNumber(data.total.failed_requests)} 失败`} />
          </div>

          {/* 每日用量趋势（独立区域，不受筛选影响） */}
          {trendStackedData.length > 0 ? (
            <div className="bg-white rounded-xl border border-gray-200 p-4 mb-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-semibold text-gray-900">每日用量趋势</span>
                <div className="flex items-center gap-1">
                  {CHART_OPTIONS.map((opt) => (
                    <button key={opt.value} onClick={() => setChartType(opt.value as ChartType)}
                      className={`px-2 py-0.5 text-xs rounded-full transition-colors ${chartType === opt.value ? "bg-[#1677ff] text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}>
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="relative w-full" style={{ height: 400, paddingLeft: 50, paddingRight: 24 }}>
                <AreaChart data={trendStackedData} xDataKey="date" aspectRatio="unset"
                  margin={{ top: 40, right: 40, bottom: 40, left: 40 }}
                  style={{ position: "absolute", inset: 0 }}>
                  <DashboardYAxis formatTick={(v) => {
                    if (chartType === "spend") return formatSpend(v);
                    return formatNumber(v);
                  }} />
                  <Grid horizontal />
                  {trendModels.map((model, i) => (
                    <Area
                      key={model}
                      dataKey={model}
                      baseDataKey={`${model}_base`}
                      fill={MODEL_COLORS[i % MODEL_COLORS.length]}
                      fillOpacity={hoveredModel === null ? 0.3 : hoveredModel === model ? 0.5 : 0.08}
                      stroke={hoveredModel !== null && hoveredModel !== model
                        ? `${MODEL_COLORS[i % MODEL_COLORS.length]}40`
                        : MODEL_COLORS[i % MODEL_COLORS.length]}
                      strokeWidth={hoveredModel === null ? 2 : hoveredModel === model ? 3 : 1}
                      fadeEdges
                    />
                  ))}
                  <ChartHoverOverlay models={trendModels} onModelHover={setHoveredModel} />
                  <XAxis />
                  <ChartTooltip
                    backgroundColor="white"
                    content={({ point }) => {
                      const dateStr = String(point.date ?? "");
                      const m = dayjs(dateStr);
                      const displayDate = `${m.month() + 1}月${m.date()}日`;
                      // 从累计值还原当日原始值，并按值从大到小排序
                      const rawEntries: { model: string; raw: number; colorIdx: number }[] = [];
                      let prevCumul = 0;
                      for (const model of trendModels) {
                        const cumul = Number((point as Record<string, unknown>)[model] ?? 0);
                        const raw = cumul - prevCumul;
                        rawEntries.push({ model, raw, colorIdx: trendModels.indexOf(model) });
                        prevCumul = cumul;
                      }
                      // 按当天原始值从大到小排序（大的在视觉底层→tooltip 底部）
                      rawEntries.sort((a, b) => b.raw - a.raw);
                      // 反转：让最大的排在 tooltip 底部（和视觉堆叠一致：小的在上，大的在下）
                      rawEntries.reverse();
                      return (
                        <div className="px-3 py-2">
                          <div className="text-[11px] text-gray-400 mb-1.5 font-medium">{displayDate}</div>
                          <div className="flex flex-col gap-1.5">
                            {rawEntries.map(({ model, raw, colorIdx }) => {
                              const displayVal = chartType === "spend" ? formatSpend(raw) : formatNumber(raw);
                              const isActive = hoveredModel === null || hoveredModel === model;
                              return (
                                <div key={model}
                                  className="flex items-center justify-between gap-4 text-xs cursor-pointer rounded px-1 py-0.5"
                                  style={{ opacity: isActive ? 1 : 0.35, transition: "opacity 0.15s" }}
                                  onMouseEnter={() => setHoveredModel(model)}
                                  onMouseLeave={() => setHoveredModel(null)}
                                >
                                  <div className="flex items-center gap-1.5">
                                    <div className="w-2 h-2 rounded-sm" style={{ background: MODEL_COLORS[colorIdx % MODEL_COLORS.length] }} />
                                    <span className="text-gray-700">{model}</span>
                                  </div>
                                  <span className="font-semibold text-gray-900 tabular-nums">{displayVal}</span>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    }}
                  />
                </AreaChart>
              </div>
              {/* 图例 */}
              {trendModels.length > 0 && (
                <div className="flex items-center justify-center gap-4 mt-3 flex-wrap">
                  {trendModels.slice().reverse().map((model, ri) => {
                    const idx = trendModels.length - 1 - ri;
                    const isActive = hoveredModel === null || hoveredModel === model;
                    return (
                      <div key={model} className="flex items-center gap-1.5 text-xs transition-opacity"
                        style={{ opacity: isActive ? 1 : 0.35, cursor: "pointer" }}
                        onMouseEnter={() => setHoveredModel(model)}
                        onMouseLeave={() => setHoveredModel(null)}
                      >
                        <div className="w-2.5 h-2.5 rounded-sm" style={{ background: MODEL_COLORS[idx % MODEL_COLORS.length] }} />
                        <span className="text-gray-600">{model}</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          ) : null}

          {/* 淡色大卡片：时间筛选 + 筛选数据 + 排行 */}
          <div className="bg-gray-50 rounded-2xl border border-gray-200 p-5">
            {/* 时间筛选条 */}
            <div className="flex items-center gap-2 mb-4">
              {TIME_OPTIONS.map((opt) => (
                <button key={opt.value} onClick={() => { setTimeRange(opt.value); setCustomRange(null); }}
                  className={`px-3 py-1.5 text-sm rounded-lg transition-colors ${timeRange === opt.value && !customRange ? "bg-[#1677ff] text-white" : "bg-white text-gray-600 hover:bg-gray-100 border border-gray-200"}`}>
                  {opt.label}
                </button>
              ))}
              <ConfigProvider locale={zhCN}>
                <DatePicker.RangePicker size="middle" style={{ width: 260 }}
                  placeholder={["开始日期", "结束日期"]}
                  onChange={(dates) => {
                    if (dates && dates[0] && dates[1]) {
                      setCustomRange([dates[0].format("YYYY-MM-DD"), dates[1].format("YYYY-MM-DD")]);
                      setTimeRange("custom");
                    } else {
                      setCustomRange(null);
                      setTimeRange("1d");
                    }
                  }}
                />
              </ConfigProvider>
            </div>

            {/* 筛选数据 3张卡片 */}
            <div className="grid grid-cols-3 gap-4 mb-4">
              <StatCard label={`${getTimeLabel(timeRange, customRange)}花费`} value={formatSpend(filteredStats.total_spend)} color="#3B82F6"
                sub={`${formatSpend(filteredStats.total_spend * 0.1)} 缓存 + ${formatSpend(filteredStats.total_spend * 0.3)} 输入 + ${formatSpend(filteredStats.total_spend * 0.6)} 输出`} />
              <StatCard label={`${getTimeLabel(timeRange, customRange)}Token`} value={formatNumber(filteredStats.total_tokens)} color="#3CB4D9"
                sub={`${formatNumber(filteredStats.cached_tokens)} 缓存 + ${formatNumber(filteredStats.prompt_tokens - filteredStats.cached_tokens)} 输入 + ${formatNumber(filteredStats.completion_tokens)} 输出`} />
              <StatCard label={`${getTimeLabel(timeRange, customRange)}请求`} value={formatNumber(filteredStats.total_requests)} color="#10B981"
                sub={`${formatNumber(filteredStats.total_requests - filteredStats.failed_requests)} 成功 + ${formatNumber(filteredStats.failed_requests)} 失败`} />
            </div>

            {/* 底部排行 */}
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-white rounded-xl border border-gray-200 p-5">
                <div className="mb-4"><span className="text-sm font-semibold text-gray-900">模型用量排行</span></div>
                <Table dataSource={filteredTopModels.slice(0, 10)} rowKey="model_name" pagination={false} size="small" columns={[
                  { title: "模型", dataIndex: "model_name", width: 200, render: (v: string) => <ModelIcon modelName={v} /> },
                  { title: "调用次数", dataIndex: "requests", align: "right" as const, width: 90, render: (v: number) => formatNumber(v) },
                  { title: "Token", dataIndex: "tokens", align: "right" as const, width: 100, render: (v: number) => formatNumber(v) },
                  { title: "费用", dataIndex: "spend", align: "right" as const, width: 100, render: (v: number) => formatSpend(v) },
                ]} />
              </div>
              <div className="bg-white rounded-xl border border-gray-200 p-5">
                <div className="mb-4"><span className="text-sm font-semibold text-gray-900">来源用量排行</span></div>
                <Table dataSource={filteredTopSources.slice(0, 10)} rowKey="source_tag" pagination={false} size="small" columns={[
                  { title: "来源", dataIndex: "source_tag", width: 200, render: (v: string) => <SourceIcon sourceTag={v} /> },
                  { title: "调用次数", dataIndex: "requests", align: "right" as const, width: 90, render: (v: number) => formatNumber(v) },
                  { title: "Token", dataIndex: "tokens", align: "right" as const, width: 100, render: (v: number) => formatNumber(v) },
                  { title: "费用", dataIndex: "spend", align: "right" as const, width: 100, render: (v: number) => formatSpend(v) },
                ]} />
              </div>
            </div>
          </div>
        </>
      ) : (
        <div className="text-center py-16 text-gray-400"><Empty description="暂无数据" /></div>
      )}
    </div>
  );
}
