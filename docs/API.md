# TransparentLLM — API 接口文档

> 版本：v1.0 | 日期：2026-07-01 | 给前端同事

---

## 概述

- **Base URL**：`http://127.0.0.1:4001`
- **Content-Type**：`application/json`（除非特别说明）
- **认证方式**：
  - 代理端点（`/v1/*`）：`Authorization: Bearer <master_key>`
  - 管理 API（`/api/*`）：Cookie-based session（先登录获取）

---

## 1. 认证 API

### 1.1 登录

```
POST /api/auth/login
```

**请求体：**
```json
{
  "master_key": "your-master-key"
}
```

**成功响应 (200)：**
```json
{
  "success": true,
  "message": "登录成功"
}
```
同时设置 `Set-Cookie: transparentllm_session=xxx; HttpOnly; Path=/`

**失败响应 (401)：**
```json
{
  "success": false,
  "message": "主密钥错误"
}
```

### 1.2 检查登录状态

```
GET /api/auth/check
```

**响应 (200)：**
```json
{
  "authenticated": true
}
```

### 1.3 登出

```
POST /api/auth/logout
```

**响应 (200)：**
```json
{
  "success": true
}
```

---

## 2. 模型管理 API

### 2.1 列出所有模型

```
GET /api/models
```

**响应 (200)：**
```json
{
  "models": [
    {
      "id": "uuid-1",
      "model_name": "gpt-4o",
      "provider": "openai",
      "api_base": "https://api.openai.com/v1",
      "api_key_masked": "sk-...xxx",       // 脱敏后的 Key，仅显示后4位
      "input_price": 0.0000025,
      "output_price": 0.00001,
      "model_type": "chat",
      "created_at": "2026-07-01T10:00:00Z",
      "updated_at": "2026-07-01T10:00:00Z"
    }
  ]
}
```

### 2.2 获取单个模型

```
GET /api/models/:id
```

**响应 (200)：** 同 2.1 中单个对象

**响应 (404)：**
```json
{
  "error": "模型不存在"
}
```

### 2.3 创建模型

```
POST /api/models
```

**请求体：**
```json
{
  "model_name": "gpt-4o",                  // 必填，唯一
  "provider": "openai",                    // 必填：openai | anthropic | custom
  "api_base": "https://api.openai.com/v1", // 必填
  "api_key": "sk-xxxx",                    // 必填，明文，后端加密存储
  "input_price": 0.0000025,               // 选填，默认 0
  "output_price": 0.00001,                // 选填，默认 0
  "model_type": "chat"                    // 选填：chat | embedding | image | audio，默认 chat
}
```

**成功响应 (201)：**
```json
{
  "id": "uuid-1",
  "model_name": "gpt-4o",
  "provider": "openai",
  "api_base": "https://api.openai.com/v1",
  "api_key_masked": "sk-...xxx",
  "input_price": 0.0000025,
  "output_price": 0.00001,
  "model_type": "chat",
  "created_at": "2026-07-01T10:00:00Z",
  "updated_at": "2026-07-01T10:00:00Z"
}
```

**失败响应 (409)：**
```json
{
  "error": "模型名已存在"
}
```

### 2.4 更新模型

```
PUT /api/models/:id
```

**请求体：** 所有字段可选（只传要更新的字段）
```json
{
  "model_name": "gpt-4o-new-name",
  "api_key": "sk-new-key",
  "input_price": 0.000003
}
```

**响应 (200)：** 同 2.3 成功响应

### 2.5 删除模型

```
DELETE /api/models/:id
```

**响应 (200)：**
```json
{
  "success": true
}
```

### 2.6 测试模型连通性

```
POST /api/models/:id/test
```

**请求体：**
```json
{
  "message": "你好，请用一句话介绍自己",    // 测试消息
  "stream": false                           // 是否流式，默认 false
}
```

**非流式响应 (200)：**
```json
{
  "success": true,
  "content": "我是 GPT-4o，OpenAI 的多模态大语言模型。",
  "total_tokens": 25,
  "prompt_tokens": 12,
  "completion_tokens": 13,
  "duration_ms": 1234
}
```

**流式响应 (200)：** `text/event-stream`
```
data: {"delta":"我是"}
data: {"delta":" GPT-4o"}
data: {"delta":"，OpenAI"}
data: [DONE]
```

**失败响应 (502)：**
```json
{
  "success": false,
  "error": "上游连接失败: Connection refused"
}
```

---

## 3. 统计 API

### 3.1 仪表盘总览

```
GET /api/stats/overview
```

**响应 (200)：**
```json
{
  "today": {
    "total_requests": 150,
    "total_tokens": 450000,
    "total_spend": 0.0123
  },
  "total": {
    "total_requests": 12000,
    "total_tokens": 36000000,
    "total_spend": 1.23
  },
  "top_models": [
    { "model_name": "gpt-4o", "requests": 80, "tokens": 240000, "spend": 0.008 },
    { "model_name": "claude-3.5", "requests": 50, "tokens": 150000, "spend": 0.003 }
  ],
  "top_sources": [
    { "source_tag": "copilot", "requests": 100, "tokens": 300000 },
    { "source_tag": "python-requests", "requests": 30, "tokens": 90000 }
  ],
  "daily_trend": [
    { "date": "2026-06-25", "requests": 120, "tokens": 360000, "spend": 0.01 },
    { "date": "2026-06-26", "requests": 135, "tokens": 400000, "spend": 0.012 }
  ]
}
```

### 3.2 每日统计明细

```
GET /api/stats/daily?from=2026-06-01&to=2026-06-30&model=gpt-4o&source=copilot
```

**参数（全部可选）：**
| 参数 | 类型 | 说明 |
|------|------|------|
| `from` | 日期 | 开始日期（含），默认 30 天前 |
| `to` | 日期 | 结束日期（含），默认今天 |
| `model` | 字符串 | 按模型名筛选 |
| `source` | 字符串 | 按来源标签筛选 |

**响应 (200)：**
```json
{
  "stats": [
    {
      "date": "2026-06-25",
      "model_name": "gpt-4o",
      "source_tag": "copilot",
      "total_requests": 80,
      "total_tokens": 240000,
      "prompt_tokens": 180000,
      "completion_tokens": 60000,
      "cache_hits": 10,
      "total_spend": 0.008
    }
  ]
}
```

---

## 4. 日志 API

### 4.1 请求日志列表

```
GET /api/logs?page=1&size=20&model=gpt-4o&source=copilot&status=success&from=2026-06-25&to=2026-06-30
```

**参数（全部可选）：**
| 参数 | 类型 | 默认 | 说明 |
|------|------|------|------|
| `page` | 整数 | 1 | 页码 |
| `size` | 整数 | 20 | 每页条数（最大 100） |
| `model` | 字符串 | - | 按模型名筛选 |
| `source` | 字符串 | - | 按来源标签筛选 |
| `status` | 字符串 | - | success / error |
| `from` | 日期 | 30 天前 | 开始日期 |
| `to` | 日期 | 今天 | 结束日期 |

**响应 (200)：**
```json
{
  "logs": [
    {
      "id": "uuid-1",
      "model_name": "gpt-4o",
      "provider": "openai",
      "source_tag": "copilot",
      "start_time": "2026-07-01T10:00:00Z",
      "end_time": "2026-07-01T10:00:03Z",
      "duration_ms": 3200,
      "total_tokens": 1500,
      "prompt_tokens": 1200,
      "completion_tokens": 300,
      "cache_hit": "true",
      "spend": 0.0000045,
      "status": "success"
    }
  ],
  "pagination": {
    "page": 1,
    "size": 20,
    "total": 150,
    "total_pages": 8
  }
}
```

### 4.2 单条日志详情

```
GET /api/logs/:id
```

**响应 (200)：**
```json
{
  "id": "uuid-1",
  "model_name": "gpt-4o",
  "provider": "openai",
  "api_base": "https://api.openai.com/v1",
  "source_tag": "copilot",
  "start_time": "2026-07-01T10:00:00Z",
  "end_time": "2026-07-01T10:00:03Z",
  "completion_start_time": "2026-07-01T10:00:01Z",
  "duration_ms": 3200,
  "total_tokens": 1500,
  "prompt_tokens": 1200,
  "completion_tokens": 300,
  "cache_hit": "true",
  "cache_key": "some-cache-key",
  "spend": 0.0000045,
  "status": "success",
  "messages": [                            // 解析后的请求 messages 数组
    {"role": "system", "content": "You are a helpful assistant."},
    {"role": "user", "content": "你好"}
  ],
  "response_text": "你好！有什么可以帮你的？",
  "error_msg": null,
  "created_at": "2026-07-01T10:00:03Z"
}
```

**`messages` 字段说明：**
- 对于 `/v1/chat/completions` 请求，这是解析后的 `messages` 数组
- 对于图像模型，可能包含 base64 图片数据（前端注意截断显示）
- 对于 Embedding 请求，只有 `input` 字段

**`response_text` 字段说明：**
- 对于非流式请求，是完整的响应文本
- 对于流式请求，是所有 chunk 拼接后的完整文本
- 对于 Embedding 请求，不存储响应体（`response_text` 为 null）

---

## 5. 设置 API

### 5.1 获取设置

```
GET /api/settings
```

**响应 (200)：**
```json
{
  "log_retention_days": 30,
  "version": "1.0.0"
}
```

### 5.2 更新设置

```
PUT /api/settings
```

**请求体：**
```json
{
  "log_retention_days": 60,         // 可选：日志保留天数
  "master_key": "new-master-key"    // 可选：修改主 Key（需同时提供 old_master_key）
}
```

修改主 Key 时必须：
```json
{
  "master_key": "new-key",
  "old_master_key": "current-key"
}
```

**响应 (200)：**
```json
{
  "success": true
}
```

---

## 6. 来源标签 API

### 6.1 获取所有来源标签

```
GET /api/source-tags
```

**响应 (200)：**
```json
{
  "tags": [
    { "tag": "copilot", "requests": 1000, "last_seen": "2026-07-01T10:00:00Z" },
    { "tag": "python-requests", "requests": 500, "last_seen": "2026-07-01T09:00:00Z" },
    { "tag": "curl", "requests": 100, "last_seen": "2026-06-30T08:00:00Z" }
  ]
}
```

---

## 7. 通用说明

### 7.1 错误响应格式

所有 API 错误统一格式：
```json
{
  "error": "人类可读的错误描述"
}
```

HTTP 状态码：
- `400` — 请求参数错误
- `401` — 未登录或主 Key 错误
- `404` — 资源不存在
- `409` — 资源冲突（如模型名重复）
- `500` — 服务器内部错误
- `502` — 上游连接失败

### 7.2 日期时间格式

所有日期时间使用 ISO 8601 格式：`2026-07-01T10:00:00Z`

日期使用：`2026-07-01`

### 7.3 模型类型枚举

| 值 | 说明 |
|-----|------|
| `chat` | 对话模型 |
| `embedding` | 嵌入模型 |
| `image` | 图像生成模型 |
| `audio` | 语音模型 |

### 7.4 提供商类型枚举

| 值 | 说明 | 用量解析格式 |
|-----|------|------------|
| `openai` | OpenAI 兼容 | `usage.total_tokens` |
| `anthropic` | Anthropic | `usage.input_tokens` + `output_tokens` |
| `custom` | 自定义/其他 | 尝试 OpenAI 格式，失败则粗略估算 |

### 7.5 来源标签自动识别规则

后端从 `User-Agent` 请求头自动提取：

| User-Agent 包含 | 标签 |
|-----------------|------|
| `copilot` / `Copilot` | `copilot` |
| `python-requests` / `Python` | `python-requests` |
| `curl` | `curl` |
| `node-fetch` / `Node` | `node-fetch` |
| `Go-http-client` | `go` |
| 其他 / 无 User-Agent | `unknown` |

---

## 8. 前端页面规划

根据 PRD 和 API，建议的前端路由：

```
/                 → 重定向到 /dashboard
/login            → 登录页
/dashboard        → 仪表盘（总览统计 + 趋势图）
/playground       → Playground（选择模型 → 输入消息 → 测试）
/models           → 模型列表 + 添加/编辑/删除
/models/:id       → 模型详情 + 编辑
/logs             → 请求日志列表（筛选 + 分页）
/logs/:id         → 单条日志详情
/settings         → 系统设置
/docs             → 使用文档
```

---

## 9. Playground 页面特别说明

Playground 本质上是一个简化的聊天界面，用于测试已配置的模型。

**交互流程：**
1. 下拉选择已配置的模型
2. 可选填入 System Prompt
3. 输入 User Message
4. 选择流式/非流式模式
5. 点击发送
6. 显示响应 + Token 用量 + 耗时

**API 调用：**
Playground 通过管理 API `POST /api/models/:id/test` 发送请求，不经过代理端点。这样 Playground 的调用不会影响源标签统计（或不记录日志，根据产品决定）。

---

## 10. 前后端约定

- 前端构建产物（`out/`）放在 Rust 项目 `static/` 目录下
- Rust 后端 `GET /ui/*` → `tower-http::fs` serve 静态文件
- 前端 `/api/*` 请求通过 Next.js `rewrites` 转发到 Rust 后端，或前端直接请求 `http://127.0.0.1:4001/api/*`（开发时用 CORS）
- **开发模式**：前端 `npm run dev` 时设置 API base URL 为 `http://127.0.0.1:4001`（需后端开启 CORS）
- **生产模式**：前端构建 → 静态文件由 Rust 后端 serve，同源无需 CORS
