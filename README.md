# TransparentLLM

轻量级 LLM 代理网关 —— 透明转发、用量记录、管理面板。

## 功能

- **代理转发** — 兼容 OpenAI `/v1/chat/completions` 等端点，支持 SSE 流式转发
- **模型管理** — 可视化增删改查上游模型，AES-256-GCM 加密存储 API Key
- **用量日志** — 每次请求记录 token、花费、TTFT（首 token 延迟）、缓存命中
- **仪表盘** — 今日/总计统计、按模型/来源分组、每日趋势图、Top 模型排行
- **Playground** — 在线测试模型对话，支持多模型并行对比
- **来源标签** — 从请求头 `x-source-tag` 自动区分调用来源

## 技术栈

| 层 | 技术 |
|---|------|
| 后端 | Rust + axum 0.7 + sqlx 0.7 + SQLite |
| 前端 | Next.js 16 + Ant Design 5 + React Query + Recharts |
| 加密 | AES-256-GCM（API Key）+ SHA-256（Master Key） |

## 快速开始

```bash
# 1. 设置加密密钥（32 字节任意字符串）
#    Windows PowerShell:
$env:TRANSPARENTLLM_ENCRYPTION_KEY="12345678901234567890123456789012"
#    Linux / macOS:
export TRANSPARENTLLM_ENCRYPTION_KEY="12345678901234567890123456789012"

# 2. 编译运行
cargo run

# 3. 浏览器访问
#    管理面板: http://127.0.0.1:18000
#    默认密码: admin

# 4. 前端开发（可选，独立运行）
cd frontend && npm install && npm run dev   # → http://127.0.0.1:3000
```

## 代理使用

```bash
# 在管理面板添加模型后，直接将请求指向 TransparentLLM
curl http://127.0.0.1:14000/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "x-source-tag: my-app" \
  -d '{
    "model": "your-model-name",
    "messages": [{"role": "user", "content": "你好"}]
  }'
```

## 配置

通过环境变量配置：

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `TRANSPARENTLLM_ENCRYPTION_KEY` | **必填**，32 字节加密密钥 | - |
| `TRANSPARENTLLM_PORT` | 监听端口 | `14000` |
| `TRANSPARENTLLM_DATABASE_PATH` | SQLite 数据库路径 | `sqlite:data/transparentllm.db?mode=rwc` |
| `TRANSPARENTLLM_LOG_RETENTION_DAYS` | 日志保留天数 | `30` |

## Docker 部署

```bash
docker compose up -d
```

详见 [docker-compose.yaml](./docker-compose.yaml)。

## 项目结构

```
TransparentLLM/
├── src/
│   ├── main.rs          # 入口 + 路由组装
│   ├── config.rs        # 环境变量配置
│   ├── proxy/           # 代理引擎（转发 + SSE + 用量解析 + 花费计算）
│   ├── routes/          # API 路由（proxy / management / health / frontend）
│   ├── models/          # 模型 CRUD + AES-256-GCM 加密
│   ├── logging/         # 请求日志 + 每日统计 + 定时清理
│   ├── auth/            # Master Key 认证 + 中间件
│   ├── db/              # SQLite 迁移
│   ├── crypto/          # 加密工具
│   └── source_tag/      # 来源标签解析
├── frontend/            # Next.js 管理面板
├── docs/                # 设计文档
├── Dockerfile
└── docker-compose.yaml
```

## License

MIT
