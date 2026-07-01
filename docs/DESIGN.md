# TransparentLLM — 系统设计文档

> 版本：v1.0 | 日期：2026-07-01

---

## 1. 架构概览

```
┌──────────────────────────────────────────────────────┐
│                    客户端 (Cursor / Copilot / curl)    │
│              → 代理 URL + 主 Key                       │
└──────────────────────┬───────────────────────────────┘
                       │ HTTP/SSE
                       ▼
┌──────────────────────────────────────────────────────┐
│                 TransparentLLM (Rust)                  │
│                                                        │
│  ┌─────────┐  ┌──────────┐  ┌────────────────────┐  │
│  │ 鉴权层   │  │ 路由层    │  │ 代理引擎            │  │
│  │ 主Key    │→│ model→   │→│ reqwest → 上游      │  │
│  │ 验证     │  │ 配置匹配  │  │ 解析响应 → 日志     │  │
│  └─────────┘  └──────────┘  └────────────────────┘  │
│                                                        │
│  ┌──────────────────────────────────────────────────┐ │
│  │              管理 API (前端面板)                    │ │
│  │  模型CRUD / 日志查询 / 统计 / 设置                  │ │
│  └──────────────────────────────────────────────────┘ │
│  ┌──────────────────────────────────────────────────┐ │
│  │            SQLite (sqlx)                           │ │
│  │   models / request_logs / daily_stats / settings   │ │
│  └──────────────────────────────────────────────────┘ │
│  ┌──────────────────────────────────────────────────┐ │
│  │        前端静态文件 (tower-http::fs)                │ │
│  └──────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────┘
                       │
                       ▼
┌──────────────────────────────────────────────────────┐
│              上游 LLM 提供商                           │
│    OpenAI / Anthropic / 通义千问 / 自定义              │
└──────────────────────────────────────────────────────┘
```

---

## 2. 模块设计

### 2.1 鉴权模块 (`auth`)

```
auth/
├── mod.rs          # 鉴权中间件工厂
├── master_key.rs   # 主 Key 的 SHA-256 哈希验证
└── extractor.rs    # 从 Authorization Bearer 头提取 Key
```

**流程**：
1. 从请求头 `Authorization: Bearer <key>` 提取 Key
2. SHA-256 哈希后与存储的主 Key 哈希比对（constant-time 比较）
3. 不匹配返回 `401 Unauthorized`
4. 管理 API 需要鉴权，代理 API 需要鉴权，健康检查 `/health` 白名单跳过

### 2.2 模型配置模块 (`models`)

```
models/
├── mod.rs           # 模型配置的增删改查
├── repository.rs    # sqlx 数据库操作
├── types.rs         # ModelConfig 结构体
└── encryption.rs    # API Key 加密/解密 (AES-256-GCM)
```

**ModelConfig 结构体**：
```rust
struct ModelConfig {
    id: String,           // UUID
    model_name: String,   // 模型名称（对外=上游原名）
    provider: String,     // 提供商: openai / anthropic / custom
    api_base: String,     // 上游 URL
    encrypted_api_key: Vec<u8>,  // AES-256-GCM 加密的 API Key
    input_price: f64,     // 输入价格 ($/token)
    output_price: f64,    // 输出价格 ($/token)
    model_type: String,   // chat / embedding / image / audio
    created_at: DateTime,
    updated_at: DateTime,
}
```

### 2.3 代理引擎 (`proxy`)

```
proxy/
├── mod.rs          # 代理入口，组合路由 + 转发 + 日志
├── router.rs       # 根据 model 字段匹配 ModelConfig
├── forward.rs      # HTTP 请求转发（reqwest 客户端池）
├── sse.rs          # SSE 流式转发（逐 chunk 处理）
├── parser.rs       # 用量解析器（按 provider 分发）
├── parser/
│   ├── mod.rs      # parse_usage(provider, body) -> UsageStats
│   ├── openai.rs   # OpenAI 格式解析
│   ├── anthropic.rs# Anthropic 格式解析
│   └── generic.rs  # 通用解析（尝试多种格式）
├── error.rs        # 错误类型和错误响应
└── types.rs        # ProxyRequest / ProxyResponse / UsageStats
```

**代理请求全链路**：
```
客户端请求 → 鉴权 → 提取 model → 查库匹配 ModelConfig
→ 构建上游请求(替换URL,注入Key) → reqwest 发送
→ 如果是 SSE: 逐 chunk 转发 + 收集完整响应
→ 如果是非流式: 等待完整响应
→ 解析 usage + cache_hit → 写 request_logs
→ 更新 daily_stats → 返回响应
```

### 2.4 日志与统计模块 (`logging`)

```
logging/
├── mod.rs            # 日志模块入口
├── request_logger.rs # request_logs 写入 + 30天清理任务
├── stats_updater.rs  # daily_stats 增量更新（按天 upsert）
├── cleanup.rs        # 定时清理过期日志
└── types.rs          # RequestLog / DailyStat 结构体
```

**30天滚动删除策略**：
- 启动时立即执行一次清理
- 之后每 6 小时执行一次
- SQL: `DELETE FROM request_logs WHERE created_at < datetime('now', '-30 days')`

**daily_stats 更新策略**：
- 每次请求完成后 upsert 该天该模型该来源的统计行
- `INSERT ... ON CONFLICT(date, model_name, source_tag) DO UPDATE SET ...`

### 2.5 管理 API (`routes/management`)

```
routes/
├── mod.rs           # axum Router 组装
├── proxy.rs         # /v1/* 代理路由
├── management/
│   ├── mod.rs       # /api/* 管理路由
│   ├── models.rs    # CRUD /api/models
│   ├── logs.rs      # GET /api/logs
│   ├── stats.rs     # GET /api/stats
│   ├── playground.rs# POST /api/playground
│   └── settings.rs  # GET/PUT /api/settings
├── health.rs        # GET /health
└── frontend.rs      # 前端静态文件托管
```

### 2.6 来源标签模块 (`source_tag`)

```
source_tag/
├── mod.rs           # User-Agent 解析
└── parser.rs        # 正则/前缀匹配常见 UA
```

**解析规则（优先级从高到低）**：
| User-Agent 包含 | 标签 |
|---|---|
| `copilot` | `copilot` |
| `hermes` | `hermes` |
| `codex` | `codex` |
| `python-requests` / `Python/` | `python` |
| `curl/` | `curl` |
| `Go-http-client/` | `go` |
| `node-fetch` / `Node.js` | `node` |
| 其他 | `unknown` |

---

## 3. 数据库设计

### 3.1 表结构

#### `models` — 模型配置
```sql
CREATE TABLE models (
    id              TEXT PRIMARY KEY,          -- UUID
    model_name      TEXT NOT NULL UNIQUE,       -- 模型名称
    provider        TEXT NOT NULL,              -- openai/anthropic/custom
    api_base        TEXT NOT NULL,              -- 上游 URL
    encrypted_api_key BLOB NOT NULL,            -- AES-256-GCM 加密
    input_price     REAL NOT NULL DEFAULT 0,    -- $/token
    output_price    REAL NOT NULL DEFAULT 0,    -- $/token
    model_type      TEXT NOT NULL DEFAULT 'chat', -- chat/embedding/image/audio
    created_at      TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);
```

#### `request_logs` — 请求日志
```sql
CREATE TABLE request_logs (
    id                      TEXT PRIMARY KEY,
    model_name              TEXT NOT NULL,
    provider                TEXT NOT NULL,
    api_base                TEXT NOT NULL,
    source_tag              TEXT NOT NULL DEFAULT 'unknown',
    start_time              TEXT NOT NULL,
    end_time                TEXT NOT NULL,
    completion_start_time   TEXT,               -- SSE 首个 token 时间
    duration_ms             INTEGER NOT NULL,
    total_tokens            INTEGER NOT NULL DEFAULT 0,
    prompt_tokens           INTEGER NOT NULL DEFAULT 0,
    completion_tokens       INTEGER NOT NULL DEFAULT 0,
    cache_hit               INTEGER NOT NULL DEFAULT 0,  -- 0/1
    cache_key               TEXT,
    spend                   REAL NOT NULL DEFAULT 0,
    status                  TEXT NOT NULL DEFAULT 'success',  -- success/error
    messages                TEXT,               -- JSON: 请求 body
    response                TEXT,               -- JSON: 响应 body
    error_msg               TEXT,
    created_at              TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_request_logs_created_at ON request_logs(created_at);
CREATE INDEX idx_request_logs_model ON request_logs(model_name);
CREATE INDEX idx_request_logs_source ON request_logs(source_tag);
```

#### `daily_stats` — 每日统计
```sql
CREATE TABLE daily_stats (
    date            TEXT NOT NULL,              -- YYYY-MM-DD
    model_name      TEXT NOT NULL,
    source_tag      TEXT NOT NULL,
    total_requests  INTEGER NOT NULL DEFAULT 0,
    total_tokens    INTEGER NOT NULL DEFAULT 0,
    prompt_tokens   INTEGER NOT NULL DEFAULT 0,
    completion_tokens INTEGER NOT NULL DEFAULT 0,
    cache_hits      INTEGER NOT NULL DEFAULT 0,
    total_spend     REAL NOT NULL DEFAULT 0,
    PRIMARY KEY (date, model_name, source_tag)
);
```

#### `settings` — 系统设置
```sql
CREATE TABLE settings (
    key     TEXT PRIMARY KEY,
    value   TEXT NOT NULL
);
```

### 3.2 数据流

```
请求进来 →
  ① 鉴权通过
  ② 匹配模型配置
  ③ 转发到上游
  ④ 解析响应 → 提取 usage
  ⑤ 写入 request_logs ← 30天后清理
  ⑥ upsert daily_stats ← 永久保留
  ⑦ 返回响应给客户端
```

---

## 4. 安全设计

### 4.1 上游 API Key 加密

- 算法：AES-256-GCM（认证加密，防篡改）
- 密钥管理：主加密密钥从环境变量 `TRANSPARENTLLM_ENCRYPTION_KEY` 读取，或首次启动自动生成并提示保存
- 加密时机：存储到数据库前加密，从数据库读取后解密
- 日志安全：日志中绝不出现明文 Key，`api_base` 中的 key 参数脱敏

### 4.2 主 Key

- 存储方式：SHA-256 哈希（不可逆），不存明文
- 首次启动：从 `TRANSPARENTLLM_MASTER_KEY` 环境变量读取，哈希后存 settings 表
- 修改：前端验证旧 Key → 哈希新 Key → 更新 settings 表
- 缺省行为：无主 Key 时所有代理请求返回 401（fail-closed）

### 4.3 部署安全

- 默认绑定 `127.0.0.1:4001`，仅本机可访问
- 可通过环境变量 `TRANSPARENTLLM_HOST` 改为 `0.0.0.0`（局域网使用）
- 数据库文件权限建议设为 600

---

## 5. 代理转发详细流程

### 5.1 非流式（`stream: false` 或未设置）

```
┌──────┐     ┌────────┐     ┌──────────┐     ┌────────┐
│客户端 │────→│ 鉴权   │────→│ 路由匹配  │────→│ 转发    │
└──────┘     └────────┘     └──────────┘     └────┬───┘
                                                  │
                    ┌─────────────────────────────┘
                    ▼
            ┌────────────┐
            │ reqwest     │
            │ POST 上游    │
            └─────┬──────┘
                  │ 完整响应
                  ▼
            ┌────────────┐
            │ 解析 usage  │
            │ 解析 cache  │
            │ 计算 spend  │
            └─────┬──────┘
                  │
      ┌───────────┼───────────┐
      ▼           ▼           ▼
┌──────────┐ ┌────────┐ ┌──────────┐
│写日志     │ │更新统计 │ │返回响应   │
│request_  │ │daily_   │ │给客户端   │
│logs      │ │stats    │ │          │
└──────────┘ └────────┘ └──────────┘
```

### 5.2 SSE 流式（`stream: true`）

```
┌──────┐     ┌────────┐     ┌──────────┐     ┌────────────┐
│客户端 │←SSE→│ 代理    │←SSE→│ reqwest  │←SSE→│ 上游 LLM    │
└──────┘     │ chunk  │     │ stream   │     └────────────┘
             │ 转发   │     └──────────┘
             │ 收集   │
             └───┬────┘
                 │ 流结束后
                 ▼
           ┌────────────┐
           │ 完整响应组装 │
           │ 解析 usage  │
           │ 写日志/统计  │
           └────────────┘
```

SSE 转发要点：
- 代理收到上游的第一个 chunk 就开始透传给客户端（低延迟）
- 同时把每个 chunk 缓存到内存，流结束后拼装完整响应
- 从完整响应中提取 usage（OpenAI 在最后一个 chunk 的 `[DONE]` 前返回）
- 如果流中断，标记 `status=error` 并记录错误

### 5.3 用量解析器

根据 `provider` 字段分发：

| provider | 解析函数 | 提取字段 |
|---|---|---|
| `openai` | `parse_openai_usage()` | `usage.total_tokens`, `usage.prompt_tokens`, `usage.completion_tokens`, `usage.prompt_tokens_details.cached_tokens` |
| `anthropic` | `parse_anthropic_usage()` | `usage.input_tokens`, `usage.output_tokens`, `usage.cache_read_input_tokens` |
| `custom` / 其他 | `parse_generic_usage()` | 尝试 OpenAI 格式 → 尝试 Anthropic 格式 → 兜底返回 0 |

**费用计算**：
```
spend = prompt_tokens × input_price + completion_tokens × output_price
```

注意：缓存命中的 token（`cached_tokens`）不计费或按折扣计费（参考上游定价）。

---

## 6. 部署架构

### 6.1 Windows (exe)

```
transparentllm.exe
├── 内嵌前端静态文件
├── 主程序 (axum server)
└── data/
    └── transparentllm.db (自动创建)
```

- 双击运行，默认监听 `http://127.0.0.1:4001`
- 浏览器打开 `http://127.0.0.1:4001` 进入管理面板

### 6.2 Linux (Docker)

```dockerfile
FROM rust:1.80-alpine AS builder
# ... 编译

FROM alpine:latest
COPY --from=builder /app/target/release/transparentllm /usr/local/bin/
COPY frontend/out /app/frontend/
EXPOSE 4001
CMD ["transparentllm"]
```

```bash
docker run -d \
  -p 4001:4001 \
  -e TRANSPARENTLLM_MASTER_KEY=your-key \
  -e TRANSPARENTLLM_ENCRYPTION_KEY=your-enc-key \
  -v ./data:/app/data \
  transparentllm:latest
```

---

## 7. 前端交互流程

### 7.1 页面路由（Next.js App Router）

| 路由 | 页面 | 说明 |
|---|---|---|
| `/` | 仪表盘 | 用量概览 |
| `/playground` | Playground | 测试模型 |
| `/models` | 模型管理 | CRUD 模型配置 |
| `/keys` | Key 管理 | 管理上游 API Key |
| `/logs` | 请求日志 | 查看对话历史 |
| `/docs` | 使用文档 | 配置指南 |
| `/settings` | 设置 | 修改主 Key 等 |

### 7.2 前后端通信

- 所有 `/api/*` 请求转发到 Rust 后端（开发时用 Next.js rewrite，生产时同源）
- 认证：前端调用管理 API 需带 `Authorization: Bearer <master-key>`
- 首次访问：未配置主 Key 时跳转到引导页

---

## 8. 技术决策记录 (ADR)

| ID | 决策 | 原因 |
|---|---|---|
| ADR-001 | 使用 sqlx 而非 rusqlite | 异步支持，以后可切 PostgreSQL |
| ADR-002 | 前端用 Next.js 而非纯 HTML | 开发体验好，Ant Design 生态 |
| ADR-003 | API Key 加密用 AES-256-GCM | 认证加密，防篡改，业界标准 |
| ADR-004 | 主 Key 用 SHA-256 哈希 | 不可逆，即使 DB 泄露 Key 也不泄露 |
| ADR-005 | V1 不做 WebSocket 代理 | 使用场景少，以后再加影响小 |
| ADR-006 | 缓存只做被动识别，不做主动缓存 | 主动缓存需要 Redis，增加部署复杂度 |
| ADR-007 | 默认绑定 localhost | 安全优先，防局域网蹭代理 |
