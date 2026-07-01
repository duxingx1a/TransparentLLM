# TransparentLLM — 产品需求文档 (PRD)

> 版本：v1.0 | 日期：2026-07-01 | 状态：设计阶段

---

## 1. 产品概述

### 1.1 产品定位

TransparentLLM 是一个**个人版 LLM 代理网关**。它在本地运行，作为所有 LLM 客户端的统一入口，负责：

- 将请求透明转发到上游 LLM 提供商（OpenAI、Anthropic、通义千问等）
- 记录每次请求的完整对话、Token 用量、费用
- 提供 Web 管理面板，可视化查看用量和日志

### 1.2 核心价值

> **你对 LLM API 调用了如指掌 —— 哪个客户端花了多少 Token、哪个模型最费钱、每次对话的完整内容，一目了然。**

### 1.3 目标用户

- **个人开发者**，单用户使用
- 需要同时对接多个 LLM 提供商，统一管理 API Key
- 需要在多个客户端（Cursor、VS Code Copilot、Python 脚本、curl）之间复用 API Key

### 1.4 非目标

- 不做多租户（团队/组织管理）
- 不做预算/限速控制
- 不做模型负载均衡/故障转移
- 不做企业级功能（SSO、RBAC、审计）

---

## 2. 功能需求

### 2.1 代理转发（核心）

| 需求编号 | 描述 | 优先级 |
|---------|------|--------|
| P-01 | 接收任意 OpenAI 兼容格式的 `/v1/chat/completions` 请求 | P0 |
| P-02 | 接收任意 OpenAI 兼容格式的 `/v1/embeddings` 请求 | P0 |
| P-03 | 接收任意格式的透传请求（图像、音频等） | P1 |
| P-04 | 根据请求中 `model` 字段匹配上游配置并转发 | P0 |
| P-05 | 支持 SSE 流式响应，边收边转 | P0 |
| P-06 | 支持非流式响应，完整接收后一次返回 | P0 |
| P-07 | 解析响应体中的 `usage` 字段，提取 Token 用量 | P0 |
| P-08 | 识别缓存命中（`cache_hit`、`cache_key`） | P1 |
| P-09 | 根据提供商类型使用不同的用量解析器 | P0 |
| P-10 | 上游请求失败时返回有意义的错误信息 | P0 |

### 2.2 认证与鉴权

| 需求编号 | 描述 | 优先级 |
|---------|------|--------|
| A-01 | 代理对外通过单一主 API Key 鉴权 | P0 |
| A-02 | 主 Key 使用 SHA-256 哈希存储，不可逆 | P0 |
| A-03 | 无主 Key 时拒绝所有请求（fail-closed） | P0 |
| A-04 | 主 Key 可通过环境变量 `TRANSPARENTLLM_MASTER_KEY` 设置 | P0 |

### 2.3 来源标签

| 需求编号 | 描述 | 优先级 |
|---------|------|--------|
| T-01 | 自动从 HTTP `User-Agent` 头解析来源标签 | P0 |
| T-02 | 支持常见来源自动识别：copilot、python-requests、curl、Go-http-client 等 | P0 |
| T-03 | 日志和统计中可按来源标签筛选 | P1 |

### 2.4 模型管理（Web 面板）

| 需求编号 | 描述 | 优先级 |
|---------|------|--------|
| M-01 | 添加上游模型配置（名称、提供商、URL、API Key、定价） | P0 |
| M-02 | 编辑已有模型配置 | P0 |
| M-03 | 删除模型配置 | P0 |
| M-04 | 查看所有已配置模型列表 | P0 |
| M-05 | 测试模型连通性（Playground） | P0 |
| M-06 | API Key 以加密形式存储（AES-256-GCM） | P0 |
| M-07 | 请求时解密 Key 用于转发，不在日志中暴露 | P0 |

### 2.5 日志与用量

| 需求编号 | 描述 | 优先级 |
|---------|------|--------|
| L-01 | 每次请求记录完整日志到 SQLite | P0 |
| L-02 | 日志包含：请求/响应体、Token 用量、费用、耗时、来源标签、状态 | P0 |
| L-03 | 详细对话日志 30 天后自动清理 | P0 |
| L-04 | 按天聚合用量统计数据永久保留 | P0 |
| L-05 | 统计维度：按模型、按来源标签、按天 | P0 |
| L-06 | 仪表盘展示：总调用次数、总 Token、总费用、趋势图 | P0 |
| L-07 | 支持按模型、时间范围、来源标签筛选日志 | P1 |

### 2.6 Playground

| 需求编号 | 描述 | 优先级 |
|---------|------|--------|
| PG-01 | 在 Web 面板中直接测试已配置的模型 | P0 |
| PG-02 | 支持输入 system prompt 和 user message | P0 |
| PG-03 | 支持流式和非流式两种模式 | P1 |
| PG-04 | 显示响应内容、Token 用量、耗时 | P0 |

### 2.7 系统设置

| 需求编号 | 描述 | 优先级 |
|---------|------|--------|
| S-01 | 修改主 Key（需验证旧 Key） | P1 |
| S-02 | 设置日志保留天数 | P1 |
| S-03 | 查看系统版本信息 | P1 |

### 2.8 文档

| 需求编号 | 描述 | 优先级 |
|---------|------|--------|
| D-01 | 内置使用文档（如何配置客户端、如何添加模型） | P1 |
| D-02 | API 端点列表 | P1 |

---

## 3. 非功能需求

### 3.1 性能

- 代理延迟：非流式额外延迟 < 50ms（不含网络），流式首字延迟 < 100ms
- 并发：支持至少 10 个并发 SSE 流

### 3.2 安全

- 上游 API Key 必须加密存储（AES-256-GCM）
- 主 Key 使用 SHA-256 哈希存储
- 日志中的 API Key 字段必须脱敏
- 默认绑定 `127.0.0.1`，不对外暴露

### 3.3 部署

- 单二进制文件部署（Windows `.exe`）
- Docker 镜像部署（Linux）
- SQLite 数据库文件自动创建，无需额外配置
- 前端静态文件嵌入二进制

### 3.4 可维护性

- Rust 代码结构清晰，模块化
- 前端 API 调用通过统一的接口层
- 数据库 migration 自动化

---

## 4. 技术约束

| 约束 | 说明 |
|------|------|
| 后端语言 | Rust (edition 2021) |
| Web 框架 | axum 0.7 |
| 数据库 | SQLite (sqlx 异步驱动) |
| HTTP 客户端 | reqwest (rustls) |
| 加密 | AES-256-GCM (ring/aead) |
| 前端 | Next.js 16 + React 18 + Ant Design 5 |
| 前端托管 | axum 静态文件服务 (tower-http) |
| 代理端口 | 默认 4001 |
| 数据库文件 | `data/transparentllm.db`（可配置） |

---

## 5. 数据模型概要

### models（模型配置表）
```
id, model_name, provider, api_base, encrypted_api_key,
input_price, output_price, model_type, created_at, updated_at
```

### request_logs（请求日志表，30天TTL）
```
id, model_name, provider, api_base, source_tag, start_time, end_time,
completion_start_time, duration_ms, total_tokens, prompt_tokens,
completion_tokens, cache_hit, cache_key, spend, status,
messages(JSON), response(JSON), error_msg, created_at
```

### daily_stats（每日统计表，永久）
```
date, model_name, source_tag, total_requests, total_tokens,
prompt_tokens, completion_tokens, cache_hits, total_spend
```

### settings（系统设置表）
```
key TEXT PRIMARY KEY, value TEXT
```

---

## 6. 项目结构（Rust 后端）

```
TransparentLLM/
├── Cargo.toml
├── src/
│   ├── main.rs              # 服务入口，axum Server
│   ├── config.rs             # 配置加载（环境变量、数据库路径等）
│   ├── db/
│   │   ├── mod.rs
│   │   ├── migrate.rs        # SQLite 建表 migration
│   │   ├── models.rs         # 数据模型 struct
│   │   └── queries.rs        # sqlx 查询函数
│   ├── auth/
│   │   ├── mod.rs
│   │   └── master_key.rs     # 主 Key 验证
│   ├── proxy/
│   │   ├── mod.rs
│   │   ├── router.rs         # 请求路由：匹配 model → 上游配置
│   │   ├── forward.rs        # reqwest 转发 + 响应解析
│   │   ├── stream.rs         # SSE 流式转发
│   │   └── parser.rs         # 用量解析器（openai/anthropic/custom）
│   ├── log/
│   │   ├── mod.rs
│   │   ├── request_log.rs    # 写 request_logs 表
│   │   └── daily_stats.rs    # 聚合写入 daily_stats
│   ├── routes/
│   │   ├── mod.rs            # axum Router 组装
│   │   ├── proxy.rs          # /v1/* 代理端点
│   │   ├── management.rs     # /api/models, /api/stats 等管理 API
│   │   └── settings.rs       # /api/settings
│   └── crypto.rs             # AES-256-GCM 加解密 + SHA-256 哈希
├── frontend/                 # Next.js 前端（同事负责）
├── data/                     # SQLite 数据库文件目录（运行时生成）
└── docs/
    ├── PRD.md
    ├── ARCHITECTURE.md
    └── API.md
```
