//! 前端静态文件托管

use std::sync::Arc;

use axum::{Router, routing::get_service};
use tower_http::services::ServeDir;

use crate::AppState;

pub fn frontend_routes() -> Router<Arc<AppState>> {
    let frontend_dir = std::env::var("TRANSPARENTLLM_FRONTEND_DIR")
        .unwrap_or_else(|_| "./frontend/out".into());

    Router::new().fallback_service(
        get_service(
            ServeDir::new(&frontend_dir)
                .append_index_html_on_directories(true)
        )
            .handle_error(|_err| async { (axum::http::StatusCode::NOT_FOUND, "Not Found") }),
    )
}

