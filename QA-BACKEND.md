# TransparentLLM — 后端 QA / 开发备忘

> 每次对话前先读这个文件，了解最新状态

---

## 当前状态

- ✅ 所有 24 个 API 接口已实现，全部需要鉴权（GET 接口之前漏加，已修复）
- ✅ 代理转发已通（Qwen3.6-27B → do.top）
- ✅ 仪表盘统计有细分数据（prompt/completion tokens）
- ✅ PUT/DELETE 路由已修复（`:id` 语法）
- ⚠️ 每次启动需设 `TRANSPARENTLLM_ENCRYPTION_KEY`

---

## 启动命令

```powershell
$env:TRANSPARENTLLM_ENCRYPTION_KEY="12345678901234567890123456789012"
cargo run
```

服务地址：`http://127.0.0.1:14000`

---

## 待解决

1. **PUT/DELETE import 警告** — `delete` 和 `put` 从 `axum::routing` 导入但未直接使用（链式路由用 MethodRouter 方法），无害可忽略
2. **`/api/models/:id/test` 有时超时** — 上游 do.top 偶发空响应，需加强错误重试
3. **加密密钥每次重启需手动设置** — 考虑写入 `.env` 文件自动加载

---

## 前端对接要点

- 所有管理 API 路径用 `:id` 不是 `{id}`
- 价格单位为 CNY（¥），模型配 `input_price`/`output_price` 填人民币
- `/api/stats/overview` 返回 `prompt_tokens` / `completion_tokens` / `total_tokens`
- 开发模式无需主密钥，登录任意密码即可
- CORS 已配置 `mirror_request` + credentials

---

## 接口清单（24个，全部需要鉴权）

| 方法 | 路径 | 说明 | 鉴权 |
|------|------|------|:--:|
| GET | /health | 健康检查 | - |
| POST | /api/auth/login | 登录 | - |
| GET | /api/auth/check | 检查登录状态 | - |
| POST | /api/auth/logout | 登出 | - |
| GET | /api/models | 模型列表 | ✅ |
| POST | /api/models | 添加模型 | ✅ |
| GET | /api/models/:id | 模型详情 | ✅ |
| PUT | /api/models/:id | 更新模型 | ✅ |
| DELETE | /api/models/:id | 删除模型 | ✅ |
| POST | /api/models/:id/test | 连通性测试 | ✅ |
| GET | /api/playground/endpoints | 可用端点列表 | ✅ |
| POST | /api/playground/chat | Playground | ✅ |
| GET | /api/logs | 日志列表（筛选+分页） | ✅ |
| GET | /api/logs/:id | 日志详情 | ✅ |
| GET | /api/stats/overview | 仪表盘总览 | ✅ |
| GET | /api/stats/daily | 每日统计 | ✅ |
| GET | /api/source-tags | 来源标签 | ✅ |
| GET | /api/settings | 获取设置 | ✅ |
| PUT | /api/settings | 更新设置 | ✅ |
| GET | /v1/models | OpenAI 模型列表 | ✅ |
| POST | /v1/chat/completions | 对话代理 | ✅ |
| POST | /v1/embeddings | 嵌入代理 | ✅ |
| POST | /v1/images/generations | 图像代理 | ✅ |
| POST | /v1/audio/transcriptions | 音频代理 | ✅ |

---

## 前端反馈待处理

- [x] **花费计算已修复**：`spend = (tokens / 1_000_000) * price`（¥/1M tokens 换算）
- [x] **`top_sources` 已加上 `tokens` 和 `spend` 字段**
- [x] **`today` 已有 `prompt_tokens` / `completion_tokens`**
- [ ] **日志列表需要加 `completion_start_time` 字段**：前端 TTFT（首 Token 时间）列需要这个字段。目前只在详情 `/api/logs/:id` 中有，列表 `/api/logs` 也需要返回
- [ ] **缓存命中需要显示 token 数**：请求日志和 daily_stats 中加 `cache_tokens` 字段
- [ ] **日志详情 `/api/logs/:id` 返回空**：前端点详情显示"日志不存在"，请检查该接口是否正常返回数据
