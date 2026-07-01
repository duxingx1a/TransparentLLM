// TransparentLLM API 调用层
// 自动根据环境选择 API 基础路径：
// - 开发环境: http://127.0.0.1:4001（从 .env 读取）
// - 生产环境: 空字符串（同源）

import type {
  ApiSuccess,
  ApiError,
  AppSettings,
  DailyStat,
  DashboardOverview,
  LogListResponse,
  LogQueryParams,
  ModelConfig,
  ModelFormData,
  PlaygroundRequest,
  PlaygroundResponse,
  RequestLogDetail,
  SourceTag,
  UpdateSettingsRequest,
} from "@/types";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || "";

/** 通用 fetch 封装 */
async function request<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const url = `${API_BASE}${path}`;
  const res = await fetch(url, {
    ...options,
    credentials: "include", // 携带 cookie（session 认证）
    headers: {
      "Content-Type": "application/json",
      ...options.headers,
    },
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const err = (body as ApiError).error || `HTTP ${res.status}`;
    throw new Error(err);
  }

  return res.json();
}

// ========== 认证 API ==========

export const authApi = {
  /** 登录 */
  login: (masterKey: string) =>
    request<ApiSuccess>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ master_key: masterKey }),
    }),

  /** 检查登录状态 */
  check: () => request<{ authenticated: boolean }>("/api/auth/check"),

  /** 登出 */
  logout: () =>
    request<ApiSuccess>("/api/auth/logout", { method: "POST" }),
};

// ========== 模型 API ==========

export const modelsApi = {
  /** 获取所有模型 */
  list: () => request<{ models: ModelConfig[] }>("/api/models"),

  /** 获取单个模型 */
  get: (id: string) => request<ModelConfig>(`/api/models/${id}`),

  /** 创建模型 */
  create: (data: ModelFormData) =>
    request<ModelConfig>("/api/models", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  /** 更新模型 */
  update: (id: string, data: Partial<ModelFormData>) =>
    request<ModelConfig>(`/api/models/${id}`, {
      method: "PUT",
      body: JSON.stringify(data),
    }),

  /** 删除模型 */
  delete: (id: string) =>
    request<ApiSuccess>(`/api/models/${id}`, { method: "DELETE" }),

  /** 测试模型连通性 */
  test: (id: string, data: PlaygroundRequest) =>
    request<PlaygroundResponse>(`/api/models/${id}/test`, {
      method: "POST",
      body: JSON.stringify(data),
    }),
};

// ========== 统计 API ==========

export const statsApi = {
  /** 仪表盘概览 */
  overview: () => request<DashboardOverview>("/api/stats/overview"),

  /** 每日统计 */
  daily: (params: {
    from?: string;
    to?: string;
    model?: string;
    source?: string;
  }) => {
    const searchParams = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => {
      if (v) searchParams.set(k, v);
    });
    const qs = searchParams.toString();
    return request<{ stats: DailyStat[] }>(`/api/stats/daily${qs ? `?${qs}` : ""}`);
  },
};

// ========== 日志 API ==========

export const logsApi = {
  /** 获取日志列表 */
  list: (params: LogQueryParams = {}) => {
    const searchParams = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== "") searchParams.set(k, String(v));
    });
    const qs = searchParams.toString();
    return request<LogListResponse>(`/api/logs${qs ? `?${qs}` : ""}`);
  },

  /** 获取日志详情 */
  detail: (id: string) => request<RequestLogDetail>(`/api/logs/${id}`),
};

// ========== 设置 API ==========

export const settingsApi = {
  /** 获取设置 */
  get: () => request<AppSettings>("/api/settings"),

  /** 更新设置 */
  update: (data: UpdateSettingsRequest) =>
    request<ApiSuccess>("/api/settings", {
      method: "PUT",
      body: JSON.stringify(data),
    }),
};

// ========== 来源标签 API ==========

export const sourceTagsApi = {
  /** 获取所有来源标签 */
  list: () => request<{ tags: SourceTag[] }>("/api/source-tags"),
};

export default {
  auth: authApi,
  models: modelsApi,
  stats: statsApi,
  logs: logsApi,
  settings: settingsApi,
  sourceTags: sourceTagsApi,
};
