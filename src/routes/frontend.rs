//! 前端静态文件托管

use std::sync::Arc;

use axum::{Router, routing::get_service};
use tower_http::services::{ServeDir, ServeFile};

use crate::AppState;

pub fn frontend_routes() -> Router<Arc<AppState>> {
    let frontend_dir = std::env::var("TRANSPARENTLLM_FRONTEND_DIR")
        .unwrap_or_else(|_| "./frontend/out".into());

    let index_path = format!("{}/index.html", frontend_dir);

    Router::new()
        .route_service("/", get_service(ServeFile::new(index_path)))
        .fallback_service(
            get_service(
                ServeDir::new(&frontend_dir)
                    .append_index_html_on_directories(true)
            )
                .handle_error(|_err| async { (axum::http::StatusCode::NOT_FOUND, "Not Found") }),
        )
}

/// 带 `/ui` 前缀的前端路由（用于合并到根 Router）
pub fn frontend_routes_ui() -> Router<Arc<AppState>> {
    let frontend_dir = std::env::var("TRANSPARENTLLM_FRONTEND_DIR")
        .unwrap_or_else(|_| "./frontend/out".into());

    let index_path = format!("{}/index.html", frontend_dir);

    Router::new()
        .route_service("/ui/", get_service(ServeFile::new(index_path)))
        .fallback_service(
            get_service(ServeDir::new(&frontend_dir))
                .handle_error(|_err| async { (axum::http::StatusCode::NOT_FOUND, "Not Found") }),
        )
}

