//! 代理路由
//!
//! 客户端调用的 OpenAI 兼容端点

use std::sync::Arc;

use axum::{
    Router,
    extract::State,
    http::HeaderMap,
    routing::{get, post},
    Json,
};
use serde_json::Value;

use crate::auth::middleware::check_auth;
use crate::proxy::{EndpointKind, ProxyError, proxy_request};
use crate::AppState;

pub fn proxy_routes() -> Router<Arc<AppState>> {
    Router::new()
        .route("/v1/models", get(list_models))
        .route("/v1/chat/completions", post(chat_completions))
        .route("/v1/embeddings", post(embeddings))
        .route("/v1/images/generations", post(images))
        .route("/v1/audio/transcriptions", post(audio_transcriptions))
}

/// GET /v1/models — OpenAI 兼容模型列表
///
/// 返回所有已配置的模型名称，供客户端（Cursor/Copilot/Continue等）自动发现
async fn list_models(
    State(state): State<Arc<AppState>>,
) -> Json<serde_json::Value> {
    let models = crate::models::list_models(&state.db).await.unwrap_or_default();
    let data: Vec<serde_json::Value> = models
        .into_iter()
        .map(|m| serde_json::json!({
            "id": m.model_name,
            "object": "model",
            "created": 0,
            "owned_by": m.provider,
        }))
        .collect();

    Json(serde_json::json!({
        "object": "list",
        "data": data,
    }))
}

/// LLM 对话补全代理
async fn chat_completions(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    body: String,
) -> Result<axum::response::Response, ProxyError> {
    if let Err(resp) = check_auth(&state, &headers) {
        return Ok(resp);
    }
    let body_json: Value = serde_json::from_str(&body)
        .map_err(|e| ProxyError::ParseError(format!("请求体 JSON 解析失败: {}", e)))?;

    proxy_request(&state, body_json, &headers, EndpointKind::Chat).await
}

/// Embeddings 代理
async fn embeddings(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    body: String,
) -> Result<axum::response::Response, ProxyError> {
    if let Err(resp) = check_auth(&state, &headers) { return Ok(resp); }
    let body_json: Value = serde_json::from_str(&body)
        .map_err(|e| ProxyError::ParseError(format!("请求体 JSON 解析失败: {}", e)))?;

    proxy_request(&state, body_json, &headers, EndpointKind::Embeddings).await
}

/// 图像代理
async fn images(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    body: String,
) -> Result<axum::response::Response, ProxyError> {
    if let Err(resp) = check_auth(&state, &headers) { return Ok(resp); }
    let body_json: Value = serde_json::from_str(&body)
        .map_err(|e| ProxyError::ParseError(format!("请求体 JSON 解析失败: {}", e)))?;

    proxy_request(&state, body_json, &headers, EndpointKind::Images).await
}

/// 音频代理
async fn audio_transcriptions(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    body: String,
) -> Result<axum::response::Response, ProxyError> {
    if let Err(resp) = check_auth(&state, &headers) { return Ok(resp); }
    let body_json: Value = serde_json::from_str(&body)
        .map_err(|e| ProxyError::ParseError(format!("请求体 JSON 解析失败: {}", e)))?;

    proxy_request(&state, body_json, &headers, EndpointKind::Audio).await
}

/// 通配路由代理（/v1/{*path}）
async fn wildcard_proxy(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    body: String,
    axum::extract::Path(path): axum::extract::Path<String>,
) -> Result<axum::response::Response, ProxyError> {
    if let Err(resp) = check_auth(&state, &headers) { return Ok(resp); }
    let body_json: Value = serde_json::from_str(&body)
        .map_err(|e| ProxyError::ParseError(format!("请求体 JSON 解析失败: {}", e)))?;

    let endpoint = EndpointKind::Passthrough(format!("/{}", path));

    proxy_request(&state, body_json, &headers, endpoint).await
}
