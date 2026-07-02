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
use axum::response::Redirect;
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

    // 组装路由
    let app = Router::new()
        .route("/", axum::routing::get(|| async { Redirect::permanent("/ui/") }))
        .merge(routes::health::health_route())
        .merge(routes::frontend::frontend_routes_ui())
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
