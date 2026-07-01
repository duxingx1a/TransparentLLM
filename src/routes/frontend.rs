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
        // 根路由直接返回 index.html
        .route_service("/", get_service(ServeFile::new(index_path)))
        // 其余文件/目录交给 ServeDir
        .fallback_service(
            get_service(
                ServeDir::new(&frontend_dir)
                    .append_index_html_on_directories(true)
            )
                .handle_error(|_err| async { (axum::http::StatusCode::NOT_FOUND, "Not Found") }),
        )
}

