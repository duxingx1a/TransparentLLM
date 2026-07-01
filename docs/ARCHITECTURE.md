# TransparentLLM — 架构设计文档

> 版本：v1.0 | 日期：2026-07-01

---

## 1. 总体架构

```
┌──────────────────────────────────────────────────────┐
│                    客户端                             │
│   Cursor  │  VS Code Copilot  │  Python  │  curl     │
└──────────┬───────────────────────────────────────────┘
           │  HTTPS / HTTP
           │  Authorization: Bearer <master_key>
           ▼
┌──────────────────────────────────────────────────────┐
│              TransparentLLM (Rust)                    │
│                                                       │
│  ┌─────────┐  ┌──────────┐  ┌──────────────────┐    │
│  │  认证    │  │  路由匹配  │  │   用量解析器      │    │
│  │ Master  │──▶│ model →  │──▶│ openai/anthropic │    │
│  │  Key    │  │  upstream │  │    /custom        │    │
│  └─────────┘  └──────────┘  └──────────────────┘    │
│                     │                                 │
│                     ▼                                 │
│  ┌──────────────────────────────────────────────┐    │
│  │              reqwest HTTP 转发                 │    │
│  │       普通请求: 一次性 POST → 解析 JSON        │    │
│  │       流式请求: SSE chunk → 边收边转边解析      │    │
│  └──────────────────────────────────────────────┘    │
│                     │                                 │
│                     ▼                                 │
│  ┌──────────────────────────────────────────────┐    │
│  │              SQLite (sqlx)                     │    │
│  │  models │ request_logs │ daily_stats │ settings │   │
│  └──────────────────────────────────────────────┘    │
│                                                       │
│  ┌──────────────────────────────────────────────┐    │
│  │         前端静态文件 (Next.js 构建产物)         │    │
│  │         /ui/* → tower-http::fs                │    │
│  └──────────────────────────────────────────────┘    │
└──────────────────────────────────────────────────────┘
           │
           ▼
┌──────────────────────────────────────────────────────┐
│          上游 LLM 提供商                               │
│   OpenAI  │  Anthropic  │  通义千问  │  自部署模型     │
└──────────────────────────────────────────────────────┘
```

---

## 2. 请求生命周期

### 2.1 非流式请求流程

```
客户端请求 /v1/chat/completions
  │
  ├─[1] axum 接收 HTTP 请求
  │     parse Authorization: Bearer <master_key>
  │     parse body JSON
  │
  ├─[2] 认证检查
  │     SHA-256(body_key) == stored_hash ?
  │     NO → 401 Unauthorized
  │
  ├─[3] 提取来源标签
  │     User-Agent → "copilot" | "python-requests" | "curl" | "unknown"
  │
  ├─[4] 路由匹配
  │     body.model → db.models WHERE model_name = ?
  │     NOT FOUND → 404 Unknown model
  │
  ├─[5] 解密上游 API Key
  │     AES-256-GCM 解密 encrypted_api_key
  │
  ├─[6] 转发请求到上游
  │     reqwest::Client::post(api_base/chat/completions)
  │     headers: Authorization: Bearer <decrypted_key>
  │     body: 原始请求体
  │     start_time = now()
  │
  ├─[7] 接收上游响应
  │     end_time = now()
  │     response_body = response.text()
  │
  ├─[8] 解析用量
  │     根据 provider 类型选择解析器：
  │       openai    → response.usage.total_tokens
  │       anthropic → response.usage.input_tokens + output_tokens
  │       custom    → 尝试 openai 格式，失败则粗略估算
  │     提取 cache_hit, cache_key（如果有）
  │
  ├─[9] 计算费用
  │     spend = prompt_tokens * input_price + completion_tokens * output_price
  │
  ├─[10] 写日志（异步，不阻塞响应）
  │      INSERT INTO request_logs (...)
  │      UPSERT INTO daily_stats (...) 聚合
  │
  └─[11] 返回响应给客户端
         原样返回上游的 status + headers + body
```

### 2.2 SSE 流式请求流程

```
客户端请求 /v1/chat/completions (stream: true)
  │
  ├─[1-5] 同非流式：认证、标签、路由、解密
  │
  ├─[6] 转发流式请求
  │     reqwest 开启 stream 模式
  │     start_time = now()
  │
  ├─[7] 逐 chunk 处理
  │     while let Ok(chunk) = response.chunk().await {
  │       // 1. 立即转发给客户端（SSE 格式）
  │       tx.send(chunk).await
  │
  │       // 2. 同时收集到 buffer 用于最终解析
  │       buffer.push(chunk)
  │
  │       // 3. 检测是否收到 [DONE]
  │       if chunk == "data: [DONE]" { break }
  │     }
  │     end_time = now()
  │
  ├─[8] 从 buffer 中解析用量
  │     合并所有 chunk → 提取最后一个有 usage 的 chunk
  │     total_tokens = last_chunk.usage.total_tokens
  │
  ├─[9] 费用计算 + [10] 写日志（同非流式）
  │
  └─[11] 流已结束，关闭连接
```

---

## 3. 数据库设计

### 3.1 ER 图

```
┌──────────────┐
│   models     │  上游模型配置
│──────────────│
│ id (PK)      │
│ model_name   │── 对外暴露的名称，客户端请求时用
│ provider     │── openai / anthropic / custom
│ api_base     │── 上游 API 地址
│ enc_api_key  │── AES-256-GCM 加密的 API Key
│ input_price  │── 每 token 输入价格（美元）
│ output_price │── 每 token 输出价格（美元）
│ model_type   │── chat / embedding / image / audio
│ created_at   │
│ updated_at   │
└──────────────┘
                      │
                      │ 1:N（一个模型多条日志）
                      ▼
┌──────────────────┐
│  request_logs    │  每次请求的详细日志（30天TTL）
│──────────────────│
│ id (PK)          │  UUID
│ model_name       │── 模型名
│ provider         │── 提供商
│ api_base         │── 上游地址
│ source_tag       │── 来源标签（copilot/python/curl/unknown）
│ start_time       │── 请求开始时间
│ end_time         │── 请求结束时间
│ comp_start_time  │── 第一个 token 生成时间（流式）/ NULL
│ duration_ms      │── 总耗时（毫秒）
│ total_tokens     │── 总 Token
│ prompt_tokens    │── 输入 Token
│ completion_tokens│── 输出 Token
│ cache_hit        │── 是否命中缓存（true/false/NULL）
│ cache_key        │── 缓存键
│ spend            │── 费用（美元）
│ status           │── success / error
│ messages         │── 请求体 JSON
│ response_text    │── 响应体文本
│ error_msg        │── 错误信息（仅失败时）
│ created_at       │── 记录创建时间
└──────────────────┘
                      │
                      │ 每日定时聚合
                      ▼
┌──────────────────┐
│  daily_stats     │  每日用量统计（永久）
│──────────────────│
│ date (PK)        │  统计日期
│ model_name (PK)  │  模型名
│ source_tag (PK)  │  来源标签
│ total_requests   │  总请求数
│ total_tokens     │  总 Token
│ prompt_tokens    │  总输入 Token
│ completion_tokens│  总输出 Token
│ cache_hits       │  缓存命中次数
│ total_spend      │  总费用
│ updated_at       │
└──────────────────┘

┌──────────────────┐
│  settings        │  系统设置（KV 存储）
│──────────────────│
│ key (PK)         │  master_key_hash, log_retention_days 等
│ value            │
└──────────────────┘
```

### 3.2 建表 SQL

```sql
-- 模型配置表
CREATE TABLE IF NOT EXISTS models (
    id TEXT PRIMARY KEY,
    model_name TEXT NOT NULL UNIQUE,
    provider TEXT NOT NULL DEFAULT 'custom',
    api_base TEXT NOT NULL,
    encrypted_api_key TEXT NOT NULL,
    input_price REAL NOT NULL DEFAULT 0.0,
    output_price REAL NOT NULL DEFAULT 0.0,
    model_type TEXT NOT NULL DEFAULT 'chat',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 请求日志表
CREATE TABLE IF NOT EXISTS request_logs (
    id TEXT PRIMARY KEY,
    model_name TEXT NOT NULL,
    provider TEXT NOT NULL DEFAULT 'custom',
    api_base TEXT NOT NULL DEFAULT '',
    source_tag TEXT NOT NULL DEFAULT 'unknown',
    start_time TEXT NOT NULL,
    end_time TEXT NOT NULL,
    completion_start_time TEXT,
    duration_ms INTEGER NOT NULL DEFAULT 0,
    total_tokens INTEGER NOT NULL DEFAULT 0,
    prompt_tokens INTEGER NOT NULL DEFAULT 0,
    completion_tokens INTEGER NOT NULL DEFAULT 0,
    cache_hit TEXT,
    cache_key TEXT,
    spend REAL NOT NULL DEFAULT 0.0,
    status TEXT NOT NULL DEFAULT 'success',
    messages TEXT,
    response_text TEXT,
    error_msg TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_request_logs_created_at ON request_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_request_logs_model_name ON request_logs(model_name);
CREATE INDEX IF NOT EXISTS idx_request_logs_source_tag ON request_logs(source_tag);
CREATE INDEX IF NOT EXISTS idx_request_logs_status ON request_logs(status);

-- 每日统计表
CREATE TABLE IF NOT EXISTS daily_stats (
    date TEXT NOT NULL,
    model_name TEXT NOT NULL,
    source_tag TEXT NOT NULL,
    total_requests INTEGER NOT NULL DEFAULT 0,
    total_tokens INTEGER NOT NULL DEFAULT 0,
    prompt_tokens INTEGER NOT NULL DEFAULT 0,
    completion_tokens INTEGER NOT NULL DEFAULT 0,
    cache_hits INTEGER NOT NULL DEFAULT 0,
    total_spend REAL NOT NULL DEFAULT 0.0,
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (date, model_name, source_tag)
);

-- 系统设置表
CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
);

-- 初始设置
INSERT OR IGNORE INTO settings (key, value) VALUES ('log_retention_days', '30');
```

---

## 4. 模块设计

### 4.1 `main.rs` — 服务入口

- 解析命令行参数和环境变量
- 初始化 SQLite 连接池（sqlx）
- 执行数据库 migration
- 构建 axum Router
- 启动 HTTP 服务器（默认 `127.0.0.1:4001`）

### 4.2 `config.rs` — 配置管理

- 读取 `TRANSPARENTLLM_MASTER_KEY` 环境变量
- 读取 `TRANSPARENTLLM_DB_PATH`（默认 `data/transparentllm.db`）
- 读取 `TRANSPARENTLLM_HOST` / `TRANSPARENTLLM_PORT`
- 读取 `ENCRYPTION_KEY`（AES 加密主密钥，必须设置）

### 4.3 `crypto.rs` — 加密模块

```
encrypt(plaintext: &str, key: &[u8; 32]) → Base64 String
decrypt(ciphertext_b64: &str, key: &[u8; 32]) → String
hash_master_key(key: &str) → SHA-256 hex String
```

### 4.4 `auth/master_key.rs` — 认证

- 从 `Authorization: Bearer <key>` 提取 Key
- SHA-256 哈希后与数据库中的 `settings.master_key_hash` 对比
- 作为 axum middleware 或 extractor 使用

### 4.5 `proxy/router.rs` — 路由匹配

- 从请求体 JSON 中提取 `model` 字段
- 查询 `models` 表找到对应配置
- 返回 `UpstreamConfig { api_base, api_key, provider, input_price, output_price }`

### 4.6 `proxy/forward.rs` — 非流式转发

- 构建 reqwest 请求（URL、Headers、Body）
- POST 到上游
- 接收完整响应
- 调用 parser 提取用量
- 写日志
- 返回响应

### 4.7 `proxy/stream.rs` — SSE 流式转发

- 构建 reqwest streaming 请求
- 使用 `axum::body::Body::from_stream` 创建流式响应体
- 逐 chunk 转发 + 收集
- 流结束后解析最终用量
- 异步写日志（不阻塞流关闭）

### 4.8 `proxy/parser.rs` — 用量解析器

```rust
trait UsageParser {
    fn parse(&self, response_body: &str) -> Result<UsageData>;
}

struct OpenAIParser;
struct AnthropicParser;
struct CustomParser; // 兜底，尝试 OpenAI 格式
```

### 4.9 `db/` — 数据访问层

- `migrate.rs`：执行建表 SQL，idempotent
- `models.rs`：Rust struct 定义（derive sqlx::FromRow）
- `queries.rs`：CRUD 和聚合查询函数

### 4.10 `routes/` — API 路由

| 路由 | 方法 | 功能 | 认证 |
|------|------|------|------|
| `/v1/chat/completions` | POST | LLM 代理 | Master Key |
| `/v1/embeddings` | POST | Embedding 代理 | Master Key |
| `/v1/*` | POST | 通用透传 | Master Key |
| `/api/models` | GET | 列出所有模型 | Session（前端登录） |
| `/api/models` | POST | 创建模型 | Session |
| `/api/models/:id` | PUT | 更新模型 | Session |
| `/api/models/:id` | DELETE | 删除模型 | Session |
| `/api/models/:id/test` | POST | 测试模型连通性 | Session |
| `/api/stats/overview` | GET | 仪表盘总览 | Session |
| `/api/stats/daily` | GET | 每日统计（?from=&to=&model=&source=） | Session |
| `/api/logs` | GET | 请求日志列表（?page=&size=&model=&source=&status=） | Session |
| `/api/logs/:id` | GET | 单条日志详情 | Session |
| `/api/settings` | GET | 获取设置 | Session |
| `/api/settings` | PUT | 更新设置 | Session |
| `/api/auth/login` | POST | 前端登录（输入主 Key → 返回 session cookie） | - |
| `/api/auth/logout` | POST | 登出 | Session |
| `/api/auth/check` | GET | 检查登录状态 | Session |
| `/ui/*` | GET | 前端静态文件 | - |

### 4.11 前端 Session 认证

前端登录流程：
1. 用户在登录页输入主 Key
2. POST `/api/auth/login` { "master_key": "xxx" }
3. 后端验证 SHA-256 → 成功则生成随机 session token，存入内存
4. 返回 session cookie
5. 后续管理 API 请求携带 cookie 验证

Session 存储在内存 `HashMap<String, SessionInfo>` 中（单用户，无需持久化）。

---

## 5. 部署架构

### 5.1 单二进制部署

```
transparentllm.exe (Windows) / transparentllm (Linux)
  ├── 嵌入前端静态文件（Next.js 构建产物 → 复制到 src/static/）
  ├── 启动时自动创建 data/ 目录和 SQLite 数据库
  └── 监听 127.0.0.1:4001
```

### 5.2 Docker 部署

```dockerfile
FROM rust:1.80-alpine AS builder
# 构建 Rust 二进制

FROM node:20-alpine AS frontend-builder
# 构建前端

FROM alpine:3.20
COPY --from=builder /app/target/release/transparentllm /usr/local/bin/
COPY --from=frontend-builder /app/out /app/static/
EXPOSE 4001
CMD ["transparentllm"]
```

### 5.3 环境变量

| 变量 | 必需 | 默认值 | 说明 |
|------|------|--------|------|
| `TRANSPARENTLLM_MASTER_KEY` | 是 | - | 代理主 Key |
| `ENCRYPTION_KEY` | 是 | - | AES 加密密钥（至少 32 字节，建议用 `openssl rand -base64 32` 生成） |
| `TRANSPARENTLLM_DB_PATH` | 否 | `data/transparentllm.db` | SQLite 数据库路径 |
| `TRANSPARENTLLM_HOST` | 否 | `127.0.0.1` | 监听地址 |
| `TRANSPARENTLLM_PORT` | 否 | `4001` | 监听端口 |

---

## 6. 错误处理策略

| 场景 | HTTP 状态码 | 响应 |
|------|-----------|------|
| 无 Authorization 头 | 401 | `{"error": "Missing master key"}` |
| 主 Key 错误 | 401 | `{"error": "Invalid master key"}` |
| 模型不存在 | 404 | `{"error": "Unknown model: xxx"}` |
| 上游连接失败 | 502 | `{"error": "Upstream connection failed: ..."}` |
| 上游返回错误 | 透传上游状态码 | 透传上游错误 body |
| 用量解析失败 | 200（不影响响应） | 日志标记 `status=partial` |

---

## 7. 关键设计决策

1. **fail-closed 策略**：主 Key 未设置时拒绝所有请求，不暴露代理
2. **用量解析失败不阻断**：即使解析失败，响应仍然返回给客户端，日志记录错误
3. **费用计算精度**：使用 `f64`，最终展示保留 6 位小数
4. **SSE chunk buffer**：流式场景下收集所有 chunk，流结束后统一解析用量和写日志
5. **日志异步写入**：`tokio::spawn` 异步写日志，不阻塞响应返回
6. **前端静态文件嵌入**：通过 `include_dir!` 宏或 `tower-http::fs` 从文件系统提供
