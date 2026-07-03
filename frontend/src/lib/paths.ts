/**
 * 路径辅助：dev 不带前缀，生产构建带 /ui 前缀
 * 与 next.config.mjs 中 basePath 保持一致
 */
const BASE_PATH = process.env.NODE_ENV === "development" ? "" : "/ui";

/** 获取应用内绝对路径（自动处理 /ui 前缀） */
export function appPath(path: string): string {
  return `${BASE_PATH}${path}`;
}
