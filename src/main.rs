//! TransparentLLM — 轻量级 LLM 代理网关
//!
//! 启动入口：读取配置 → 初始化数据库 → 构建路由 → 启动 axum 服务
//!
//! 默认绑定 127.0.0.1:4001，可通过环境变量覆盖

mod auth;
mod config;
mod crypto;
mod db;
mod logging;
mod models;
mod proxy;
mod routes;
mod source_tag;

use std::net::SocketAddr;
use std::sync::Arc;

use axum::Router;
use axum::response::Html;
use tower_http::cors::CorsLayer;
use sqlx::sqlite::SqlitePoolOptions;
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt, EnvFilter};

use crate::auth::AuthState;
use crate::config::AppConfig;
use crate::db::run_migrations;
use crate::logging::start_cleanup_task;

/// 共享应用状态
pub struct AppState {
    pub db: sqlx::SqlitePool,
    pub config: AppConfig,
    pub auth: AuthState,
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    // 初始化日志
    tracing_subscriber::registry()
        .with(EnvFilter::try_from_default_env().unwrap_or_else(|_| "info".into()))
        .with(tracing_subscriber::fmt::layer())
        .init();

    // 读取配置
    let config = AppConfig::from_env()?;
    tracing::info!("数据库路径: {}", config.database_url);

    // 初始化数据库连接池
    let db = SqlitePoolOptions::new()
        .max_connections(5)
        .connect(&config.database_url)
        .await?;

    // 执行数据库迁移
    run_migrations(&db).await?;
    tracing::info!("数据库迁移完成");

    // 初始化鉴权状态
    let auth = AuthState::new(&db, &config).await?;

    // 启动日志清理任务（每 6 小时清理一次过期日志）
    start_cleanup_task(db.clone(), config.log_retention_days);

    // 构建应用状态
    let state = Arc::new(AppState { db, config: config.clone(), auth });

    // 组装路由（前端由 nginx 统一 serve）
    let app = Router::new()
        // / → 接口文档页
        .route("/", axum::routing::get(api_docs))
        .merge(routes::health::health_route())
        .merge(routes::proxy::proxy_routes())
        .merge(routes::management::management_routes())
        .layer(
            CorsLayer::new()
                .allow_origin(tower_http::cors::AllowOrigin::mirror_request())
                .allow_credentials(true)
                .allow_methods(vec![
                    "GET".parse().unwrap(),
                    "POST".parse().unwrap(),
                    "PUT".parse().unwrap(),
                    "DELETE".parse().unwrap(),
                    "OPTIONS".parse().unwrap(),
                ])
                .allow_headers(vec![
                    "Content-Type".parse().unwrap(),
                    "Authorization".parse().unwrap(),
                ]),
        )
        .with_state(state);

    // 启动服务
    let addr: SocketAddr = format!("{}:{}", config.host, config.port).parse()?;
    tracing::info!("TransparentLLM 启动: http://{}", addr);

    let listener = tokio::net::TcpListener::bind(addr).await?;
    axum::serve(listener, app).await?;

    Ok(())
}

/// GET / — 接口文档页（预留，后续完善）
async fn api_docs() -> Html<&'static str> {
    Html(
        r#"<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>TransparentLLM — API 文档</title>
<style>
  :root { --primary: #1677ff; --bg: #f5f7fa; --card: #fff; --border: #e8ecf0; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: var(--bg); color: #1a1a1a; line-height: 1.6; }
  header { background: linear-gradient(135deg, #1677ff, #4096ff); color: #fff; padding: 32px 40px; }
  header h1 { font-size: 24px; font-weight: 600; }
  header p { margin-top: 6px; opacity: .85; font-size: 14px; }
  main { max-width: 960px; margin: 24px auto; padding: 0 20px 60px; }
  .card { background: var(--card); border: 1px solid var(--border); border-radius: 8px; margin-bottom: 20px; overflow: hidden; }
  .card h2 { font-size: 16px; padding: 14px 20px; border-bottom: 1px solid var(--border); color: var(--primary); display: flex; align-items: center; gap: 8px; }
  table { width: 100%; border-collapse: collapse; }
  th, td { padding: 10px 20px; text-align: left; font-size: 13px; border-bottom: 1px solid var(--border); }
  th { background: #fafbfc; font-weight: 600; color: #555; font-size: 12px; text-transform: uppercase; letter-spacing: .5px; }
  tr:last-child td { border-bottom: none; }
  .method { display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: 700; letter-spacing: .3px; min-width: 52px; text-align: center; }
  .get { background: #e6f7e6; color: #389e0d; }
  .post { background: #e6f4ff; color: #1677ff; }
  .put { background: #fff3e0; color: #d46b08; }
  .delete { background: #ffece8; color: #cf1322; }
  code { font-family: 'SF Mono', 'Fira Code', monospace; font-size: 12.5px; color: #333; }
  .tip { background: #fffbe6; border-left: 3px solid #fadb14; padding: 10px 16px; font-size: 13px; margin: 0 20px 16px; border-radius: 0 4px 4px 0; }
  .tip a { color: #1677ff; }
  .tag { display: inline-block; background: #f0f0f0; color: #666; padding: 1px 6px; border-radius: 3px; font-size: 11px; margin-left: 6px; }
  td:first-child { width: 90px; }
  td:nth-child(3) { color: #666; }
</style>
</head>
<body>
<header>
  <h1>TransparentLLM API</h1>
  <p>轻量级 LLM 代理网关 — 透明转发 · 用量记录 · 管理面板</p>
</header>

<main>

<div class="card">
  <h2>🔌 LLM 代理 <span class="tag">/v1/*</span></h2>
  <div class="tip">认证方式：<code>Authorization: Bearer &lt;master_key&gt;</code></div>
  <table>
  <tr><th>方法</th><th>端点</th><th>说明</th></tr>
  <tr><td><span class="method get">GET</span></td><td><code>/v1/models</code></td><td>模型列表（OpenAI 兼容）</td></tr>
  <tr><td><span class="method post">POST</span></td><td><code>/v1/chat/completions</code></td><td>对话补全代理</td></tr>
  <tr><td><span class="method post">POST</span></td><td><code>/v1/embeddings</code></td><td>文本嵌入代理</td></tr>
  <tr><td><span class="method post">POST</span></td><td><code>/v1/images/generations</code></td><td>图像生成代理</td></tr>
  <tr><td><span class="method post">POST</span></td><td><code>/v1/audio/transcriptions</code></td><td>音频转录代理</td></tr>
  </table>
</div>

<div class="card">
  <h2>🔧 管理接口 <span class="tag">/api/*</span></h2>
  <div class="tip">认证方式：Cookie（通过 <code>/ui</code> 管理面板登录获取）</div>

  <table><tr><th colspan="3" style="background:#fafbfc;font-size:13px;color:var(--primary)">认证</th></tr>
  <tr><td><span class="method post">POST</span></td><td><code>/api/auth/login</code></td><td>登录</td></tr>
  <tr><td><span class="method get">GET</span></td><td><code>/api/auth/check</code></td><td>检查登录状态</td></tr>
  <tr><td><span class="method post">POST</span></td><td><code>/api/auth/logout</code></td><td>登出</td></tr>
  </table>

  <table><tr><th colspan="3" style="background:#fafbfc;font-size:13px;color:var(--primary)">模型管理</th></tr>
  <tr><td><span class="method get">GET</span></td><td><code>/api/models</code></td><td>模型列表</td></tr>
  <tr><td><span class="method post">POST</span></td><td><code>/api/models</code></td><td>添加模型</td></tr>
  <tr><td><span class="method get">GET</span></td><td><code>/api/models/:id</code></td><td>模型详情</td></tr>
  <tr><td><span class="method put">PUT</span></td><td><code>/api/models/:id</code></td><td>更新模型</td></tr>
  <tr><td><span class="method delete">DELETE</span></td><td><code>/api/models/:id</code></td><td>删除模型</td></tr>
  <tr><td><span class="method post">POST</span></td><td><code>/api/models/:id/test</code></td><td>连通性测试</td></tr>
  <tr><td><span class="method post">POST</span></td><td><code>/api/playground/chat</code></td><td>Playground 对话</td></tr>
  </table>

  <table><tr><th colspan="3" style="background:#fafbfc;font-size:13px;color:var(--primary)">日志 & 统计</th></tr>
  <tr><td><span class="method get">GET</span></td><td><code>/api/logs</code></td><td>日志列表（筛选 + 分页）</td></tr>
  <tr><td><span class="method get">GET</span></td><td><code>/api/logs/:id</code></td><td>日志详情</td></tr>
  <tr><td><span class="method get">GET</span></td><td><code>/api/stats/overview</code></td><td>仪表盘总览</td></tr>
  <tr><td><span class="method get">GET</span></td><td><code>/api/stats/daily</code></td><td>每日统计</td></tr>
  </table>

  <table><tr><th colspan="3" style="background:#fafbfc;font-size:13px;color:var(--primary)">设置</th></tr>
  <tr><td><span class="method get">GET</span></td><td><code>/api/settings</code></td><td>获取设置</td></tr>
  <tr><td><span class="method put">PUT</span></td><td><code>/api/settings</code></td><td>更新设置</td></tr>
  <tr><td><span class="method get">GET</span></td><td><code>/api/source-tags</code></td><td>来源标签</td></tr>
  </table>
</div>

<div class="card">
  <h2>📋 其他</h2>
  <table>
  <tr><td><span class="method get">GET</span></td><td><code>/health</code></td><td>健康检查</td></tr>
  <tr><td><span class="method get">GET</span></td><td><code>/ui/*</code></td><td>管理面板（<a href="/ui">/ui</a>）</td></tr>
  </table>
</div>

</main>
</body>
</html>"#,
    )
}
