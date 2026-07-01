# TransparentLLM — 前端 QA / 开发备忘

> 每次对话前先读这个文件，了解最新状态

---

## 当前状态

- ✅ 基础页面框架已搭建
- ✅ 模型管理页面（价格改为 ¥/1M tokens）
- ✅ 仪表盘已对接细分数据
- ⚠️ 输入/输出 Token 已对接 `prompt_tokens` / `completion_tokens`（如果后端没返回则 fallback）

---

## 后端接口说明

- 所有 API 以 `/api/` 开头
- 路径参数用 `:id` 不是 `{id}`
- 后端端口 **14000**（前端 dev server 需配 rewrites 代理到 14000）
- 开发模式无需主密钥，`/api/auth/login` 任意密码都能登录
- 登录后需在后续请求带 `Authorization: Bearer <密码>`

---

## 前端对接要点

### 模型管理
- 价格单位：¥/1M tokens（前端显示转换）
- `api_key` 不在 GET 响应中返回，只有 `has_key: true/false`
- 模型价格：`input_price`（输入） / `output_price`（输出）

### 仪表盘
- `GET /api/stats/overview` 返回 `today` / `total` / `top_models` / `top_sources` / `daily_trend`
- 细分数据：`prompt_tokens` / `completion_tokens` / `total_tokens`
- `currency: "CNY"` 标识

### 日志
- `GET /api/logs?page=1&size=20&model=xxx&source=xxx&status=xxx`
- 每条日志有 `prompt_tokens` / `completion_tokens` 细分

---

## 待解决

- [ ] 页面路由 / SPA fallback
- [ ] Playground 页面
- [ ] 来源标签页面
- [ ] 文档页面
- [ ] 设置页面（主密钥更新、日志保留天数）

---

## 后端反馈待处理

- [x] **花费已按 ¥/1M tokens 换算** — `spend = (tokens / 1M) * price`
- [x] **top_sources 已加 `tokens` 和 `spend`**
- [x] **today 已含 `prompt_tokens` / `completion_tokens`**
- [ ] 仪表盘 "今日模型分布" 展示
- [ ] 日志详情页展示 messages/response 内容
- [ ] 模型测试按钮对接 `/api/models/:id/test`
