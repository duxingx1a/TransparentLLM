// TransparentLLM API 调用层
// 自动根据环境选择 API 基础路径：
// - 开发环境: http://127.0.0.1:18400（通过 next.config.js rewrites 代理）
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
  ProviderConfig,
  ProviderFormData,
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

  const token = typeof window !== "undefined" ? localStorage.getItem("master_key") : null;
  const authHeaders: Record<string, string> = token
    ? { Authorization: `Bearer ${token}` }
    : {};

  let res: Response;
  try {
    res = await fetch(url, {
      ...options,
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        ...authHeaders,
        ...options.headers as Record<string, string>,
      },
    });
  } catch {
    throw new Error(`网络请求失败：无法连接到服务器（${url}）`);
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    // 后端返回的 error 可能是字符串，也可能是嵌套对象 {message, type, code}
    let errStr = `HTTP ${res.status}`;
    const rawErr = (body as any).error;
    if (typeof rawErr === "string") {
      errStr = rawErr;
    } else if (typeof rawErr === "object" && rawErr !== null) {
      errStr = rawErr.message || rawErr.detail || JSON.stringify(rawErr);
    } else if (rawErr) {
      errStr = String(rawErr);
    }
    throw new Error(errStr);
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

  /** 价格变更后重新计算所有日志的花费 */
  recalculateSpend: () =>
    request<{ success: boolean; updated_logs: number; message: string }>(
      "/api/models/recalculate-spend",
      { method: "POST" }
    ),
};

// ========== 提供商 API ==========

export const providersApi = {
  /** 获取所有提供商 */
  list: () => request<{ providers: ProviderConfig[] }>("/api/providers"),

  /** 获取单个提供商 */
  get: (id: string) => request<ProviderConfig>(`/api/providers/${id}`),

  /** 创建提供商 */
  create: (data: ProviderFormData) =>
    request<ProviderConfig>("/api/providers", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  /** 更新提供商 */
  update: (id: string, data: Partial<ProviderFormData>) =>
    request<ProviderConfig>(`/api/providers/${id}`, {
      method: "PUT",
      body: JSON.stringify(data),
    }),

  /** 删除提供商 */
  delete: (id: string) =>
    request<ApiSuccess>(`/api/providers/${id}`, { method: "DELETE" }),

  /** 获取提供商的模型列表 */
  getModels: (id: string) =>
    request<{ models: string[] }>(`/api/providers/${id}/models`),
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
    return request<{ daily: DailyStat[] }>(`/api/stats/daily${qs ? `?${qs}` : ""}`);
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

// ========== Playground API ==========

export const playgroundApi = {
  /** 发送聊天消息（非流式） */
  chat: (data: PlaygroundRequest) =>
    request<PlaygroundResponse>("/api/playground/chat", {
      method: "POST",
      body: JSON.stringify(data),
      headers: { "X-Source": "TransparentLLM" } as Record<string, string>,
    }),

  /** 发送聊天消息（流式） */
  chatStream: async function* (
    data: PlaygroundRequest,
    signal?: AbortSignal
  ): AsyncGenerator<{ content?: string; reasoning_content?: string; reasoning?: string; usage?: any; done?: boolean }> {
    const token = typeof window !== "undefined" ? localStorage.getItem("master_key") : null;
    const streamBase = API_BASE;
    const res = await fetch(`${streamBase}/api/playground/chat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Source": "TransparentLLM",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ ...data, stream: true }),
      signal,
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(text || `HTTP ${res.status}`);
    }

    const reader = res.body?.getReader();
    if (!reader) throw new Error("无法读取响应流");

    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith("data:")) continue;
        const payload = trimmed.slice(5).trim();
        if (payload === "[DONE]") {
          yield { done: true };
          return;
        }
        try {
          const json = JSON.parse(payload);
          const delta = json.choices?.[0]?.delta;
          if (delta) {
            yield {
              content: delta.content || undefined,
              reasoning_content: delta.reasoning_content || undefined,
              reasoning: delta.reasoning || undefined,
              done: json.choices?.[0]?.finish_reason != null,
            };
          }
          if (json.usage) {
            yield { usage: json.usage };
          }
        } catch {
          // skip malformed chunks
        }
      }
    }
  },

  /** 获取可用端点列表 */
  endpoints: () =>
    request<Array<{ id: string; name: string; path: string }>>("/api/playground/endpoints"),
};

export default {
  auth: authApi,
  models: modelsApi,
  stats: statsApi,
  logs: logsApi,
  settings: settingsApi,
  sourceTags: sourceTagsApi,
};
