// TransparentLLM 前端类型定义

// ========== 模型相关 ==========

/** 模型配置 */
export interface ModelConfig {
  id: string;
  model_name: string;
  provider: string;
  api_base: string;
  input_price: number;
  output_price: number;
  cache_price: number;
  model_type: string;
  created_at: string;
  updated_at: string;
  has_key: boolean;
  decrypted_api_key: string;
}

/** 创建/更新模型请求 */
export interface ModelFormData {
  model_name: string;
  provider: string;
  api_base: string;
  api_key: string;
  input_price?: number;
  output_price?: number;
  cache_price?: number;
  model_type?: string;
}

// ========== 提供商相关 ==========

/** 提供商配置 */
export interface ProviderConfig {
  id: string;
  name: string;
  api_base: string;
  decrypted_api_key: string;
  created_at: string;
  updated_at: string;
}

/** 创建/更新提供商请求 */
export interface ProviderFormData {
  name: string;
  api_base: string;
  api_key: string;
}

// ========== 日志相关 ==========

/** 请求日志（列表项） */
export interface RequestLogItem {
  id: string;
  model_name: string;
  provider: string;
  source_tag: string;
  start_time: string;
  end_time: string;
  completion_start_time?: string | null;
  duration_ms: number;
  ttft_ms?: number | null;
  total_tokens: number;
  prompt_tokens: number;
  completion_tokens: number;
  cached_tokens: number;
  cache_hit: string | null;
  spend: number;
  status: "success" | "error";
  error_msg?: string | null;
  tokens_per_second: number;
}

/** 请求日志详情 */
export interface RequestLogDetail extends RequestLogItem {
  api_base: string;
  completion_start_time: string | null;
  cached_tokens: number;
  cache_key: string | null;
  messages: ChatMessage[] | null;
  response_text: string | null;
  thinking_text?: string | null;
  reply_text?: string | null;
  response?: any;
  error_msg: string | null;
  created_at: string;
  tokens_per_second: number;
}

/** 聊天消息 */
export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

/** 日志列表请求参数 */
export interface LogQueryParams {
  page?: number;
  size?: number;
  model_name?: string;
  source_tag?: string;
  status?: string;
  start_date?: string;
  end_date?: string;
}

/** 分页信息 */
export interface Pagination {
  page: number;
  size: number;
  total: number;
  total_pages: number;
}

/** 日志列表响应 */
export interface LogListResponse {
  logs: RequestLogItem[];
  pagination: Pagination;
}

// ========== 统计相关 ==========

/** 仪表盘概览 */
export interface DashboardOverview {
  today: {
    total_requests: number;
    failed_requests: number;
    total_tokens: number;
    prompt_tokens?: number;
    completion_tokens?: number;
    cached_tokens?: number;
    total_spend: number;
  };
  total: {
    total_requests: number;
    failed_requests: number;
    total_tokens: number;
    prompt_tokens: number;
    completion_tokens: number;
    cached_tokens: number;
    total_spend: number;
  };
  top_models: Array<{
    model_name: string;
    requests: number;
    tokens: number;
    spend: number;
  }>;
  top_sources: Array<{
    source_tag: string;
    requests: number;
    tokens: number;
    cached_tokens: number;
  }>;
  daily_trend: Array<{
    date: string;
    requests: number;
    tokens: number;
    spend: number;
  }>;
  daily_by_model: Array<{
    date: string;
    model_name: string;
    requests: number;
    tokens: number;
    spend: number;
    cached_tokens: number;
  }>;
  daily_by_source: Array<{
    date: string;
    source_tag: string;
    requests: number;
    tokens: number;
    spend: number;
    cached_tokens: number;
  }>;
}

/** 每日统计 */
export interface DailyStat {
  date: string;
  model_name: string;
  source_tag: string;
  total_requests: number;
  total_tokens: number;
  prompt_tokens: number;
  completion_tokens: number;
  cache_hits: number;
  total_spend: number;
}

// ========== Playground 相关 ==========

/** Playground 请求体 */
export interface PlaygroundRequest {
  model_name: string;
  messages: Array<{ role: string; content: string }>;
  stream: boolean;
  temperature?: number;
  max_tokens?: number;
  endpoint_type?: string;
  system_prompt?: string;
  compare_models?: string[];
}

/** Playground 非流式响应 */
export interface PlaygroundResponse {
  success: boolean;
  content?: string;
  model?: string;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
  duration_ms?: number;
  error?: string;
  raw_response?: any;
}

/** Playground 流式响应 chunk */
export interface PlaygroundStreamChunk {
  content?: string;
  reasoning_content?: string;
  finish_reason?: string | null;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

/** 对比模式单个结果 */
export interface CompareResult {
  model_name: string;
  success: boolean;
  content?: string;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
  duration_ms?: number;
  error?: string;
}

// ========== 设置相关 ==========

/** 系统设置 */
export interface AppSettings {
  log_retention_days: number;
  version: string;
}

/** 更新设置请求 */
export interface UpdateSettingsRequest {
  log_retention_days?: number;
  master_key?: string;
  old_master_key?: string;
}

// ========== 来源标签 ==========

/** 来源标签 */
export interface SourceTag {
  tag: string;
  requests: number;
  last_seen: string;
}

// ========== 通用 API 响应 ==========

/** 通用成功响应 */
export interface ApiSuccess {
  success: boolean;
  message?: string;
}

/** 通用错误响应 */
export interface ApiError {
  error: string;
}
