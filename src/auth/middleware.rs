//! 鉴权工具函数
//!
//! 提供内联鉴权检查，在各路由 handler 中调用

use axum::http::{HeaderMap, StatusCode};
use axum::response::{IntoResponse, Response};

use crate::AppState;

/// 检查请求是否通过鉴权
///
/// 返回 Ok(()) 表示通过，返回 Err(response) 表示 401
pub fn check_auth(state: &AppState, headers: &HeaderMap) -> Result<(), Response> {
    // 未设置主 Key → 放行
    if !state.auth.has_master_key() {
        return Ok(());
    }

    let auth_header = headers
        .get("Authorization")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("");

    let key = auth_header.strip_prefix("Bearer ").unwrap_or("");

    if key.is_empty() {
        return Err(unauthorized_response("缺少 Authorization Bearer 头"));
    }

    if !state.auth.verify_master_key(key) {
        return Err(unauthorized_response("API Key 错误"));
    }

    Ok(())
}

/// 返回 401 响应
fn unauthorized_response(message: &str) -> Response {
    let body = serde_json::json!({
        "error": {
            "message": message,
            "type": "authentication_error",
            "code": 401
        }
    });
    (StatusCode::UNAUTHORIZED, axum::Json(body)).into_response()
}
