//! 健康检查路由

use std::sync::Arc;

use axum::{Router, extract::State, routing::get, Json};

use crate::AppState;

pub fn health_route() -> Router<Arc<AppState>> {
    Router::new().route("/health", get(health_check))
}

async fn health_check(State(state): State<Arc<AppState>>) -> Json<serde_json::Value> {
    Json(serde_json::json!({
        "status": "ok",
        "version": env!("CARGO_PKG_VERSION"),
        "has_master_key": state.auth.has_master_key(),
    }))
}
