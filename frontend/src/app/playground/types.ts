// 简化的游戏场类型定义
export interface CompareResult {
  model_name: string;
  success: boolean;
  content?: string;
  usage?: {
    completionTokens?: number;
    promptTokens?: number;
    totalTokens?: number;
    reasoningTokens?: number;
    cost?: number;
  };
  duration_ms?: number;
  error?: string;
}