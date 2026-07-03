//! 代理引擎模块
//!
//! 负责 HTTP/SSE 请求转发到上游 LLM 提供商

pub mod parser;
pub mod sse;

use std::sync::OnceLock;
use std::time::{Duration, Instant};

use axum::http::{HeaderMap, StatusCode};
use axum::response::{IntoResponse, Response};

use crate::logging::{RequestLogEntry, update_daily_stats, write_request_log};
use crate::models::{ModelConfigFull, decrypt_api_key};
use crate::source_tag::parse_source_tag;
use crate::AppState;

use self::parser::UsageStats;

/// 上游请求超时
const UPSTREAM_TIMEOUT: Duration = Duration::from_secs(120);

/// 转发到上游的安全请求头
const FORWARD_HEADERS: &[&str] = &[
    "accept",
    "accept-encoding",
    "x-request-id",
    "x-stainless-os",
    "x-stainless-arch",
    "x-stainless-lang",
    "x-stainless-package-version",
    "x-stainless-runtime",
    "x-stainless-runtime-version",
];

/// 获取共享 reqwest 客户端（连接池复用）
fn http_client() -> &'static reqwest::Client {
    static CLIENT: OnceLock<reqwest::Client> = OnceLock::new();
    CLIENT.get_or_init(|| {
        reqwest::Client::builder()
            .timeout(UPSTREAM_TIMEOUT)
            .pool_max_idle_per_host(5)
            .connect_timeout(Duration::from_secs(5))
            .build()
            .expect("创建 HTTP 客户端失败")
    })
}

/// API 端点类型
#[derive(Debug, Clone)]
pub enum EndpointKind {
    Chat,
    Embeddings,
    Images,
    Audio,
    Passthrough(String),
}

impl EndpointKind {
    fn upstream_path(&self) -> String {
        match self {
            EndpointKind::Chat => "/chat/completions".into(),
            EndpointKind::Embeddings => "/embeddings".into(),
            EndpointKind::Images => "/images/generations".into(),
            EndpointKind::Audio => "/audio/transcriptions".into(),
            EndpointKind::Passthrough(p) => p.clone(),
        }
    }
}

/// 从请求体中提取 messages 数组（与 LiteLLM 行为对齐）
fn extract_messages_json(body: &serde_json::Value) -> Option<String> {
    body.get("messages")
        .and_then(|m| serde_json::to_string(m).ok())
}

/// 代理请求的错误类型
#[derive(Debug)]
pub enum ProxyError {
    ModelNotFound(String),
    UpstreamError(String, Option<serde_json::Value>),
    ParseError(String),
}

impl IntoResponse for ProxyError {
    fn into_response(self) -> Response {
        match self {
            ProxyError::ModelNotFound(m) => {
                let body = serde_json::json!({
                    "error": {"message": format!("模型未配置: {}", m), "type": "proxy_error", "code": 404}
                });
                (StatusCode::NOT_FOUND, axum::Json(body)).into_response()
            }
            ProxyError::UpstreamError(_m, Some(upstream_body)) => {
                (StatusCode::BAD_GATEWAY, axum::Json(upstream_body)).into_response()
            }
            ProxyError::UpstreamError(m, None) => {
                let body = serde_json::json!({
                    "error": {"message": format!("上游请求失败: {}", m), "type": "proxy_error", "code": 502}
                });
                (StatusCode::BAD_GATEWAY, axum::Json(body)).into_response()
            }
            ProxyError::ParseError(m) => {
                let body = serde_json::json!({
                    "error": {"message": format!("响应解析失败: {}", m), "type": "proxy_error", "code": 500}
                });
                (StatusCode::INTERNAL_SERVER_ERROR, axum::Json(body)).into_response()
            }
        }
    }
}

/// 执行代理转发
pub async fn proxy_request(
    state: &AppState,
    body: serde_json::Value,
    headers: &HeaderMap,
    endpoint: EndpointKind,
) -> Result<Response, ProxyError> {
    let start = Instant::now();
    let start_time = chrono::Utc::now().to_rfc3339();

    let model_name = body
        .get("model")
        .and_then(|v| v.as_str())
        .unwrap_or("unknown")
        .to_string();

    // 解析 provider-model_name 格式（用第一个 - 分隔），优先精确匹配
    let model_config = if let Some((prov, name)) = model_name.split_once('-') {
        match crate::models::get_model_by_name_and_provider(&state.db, name, prov).await {
            Ok(Some(cfg)) => Some(cfg),
            _ => {
                // 精确匹配失败，回退到仅按 model_name 匹配
                crate::models::get_model_by_name(&state.db, &model_name).await.ok().flatten()
            }
        }
    } else {
        crate::models::get_model_by_name(&state.db, &model_name).await.ok().flatten()
    };

    let model_config = model_config
        .ok_or_else(|| ProxyError::ModelNotFound(model_name.clone()))?;

    let mut api_key = decrypt_api_key(&model_config.encrypted_api_key, &state.config.encryption_key)
        .map_err(|e| ProxyError::UpstreamError(format!("Key 解密失败: {}", e), None))?;

    // 如果 api_key 是占位符，从提供商表获取真实 key
    if api_key == "auto-from-provider" || api_key.is_empty() {
        if let Ok(Some(prov_row)) = crate::models::get_provider_by_name(&state.db, &model_config.provider).await {
            api_key = decrypt_api_key(&prov_row.encrypted_api_key, &state.config.encryption_key)
                .unwrap_or_default();
        }
    }

    // 转发给上游时：用 upstream_model_name 替代 model 字段
    let upstream_real_name = {
        if !model_config.upstream_model_name.is_empty() {
            model_config.upstream_model_name.clone()
        } else {
            // 移除 model_name 中的 provider- 前缀（如果存在）
            model_name.split_once('-').map(|(_, n)| n.to_string()).unwrap_or(model_name.clone())
        }
    };
    let mut upstream_body = body.clone();
    if let Some(obj) = upstream_body.as_object_mut() {
        obj.insert("model".into(), serde_json::Value::String(upstream_real_name.clone()));
    }

    let user_agent = headers
        .get("user-agent")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("");
    let source_tag = parse_source_tag(user_agent).to_string();

    let is_stream = upstream_body
        .get("stream")
        .and_then(|v| v.as_bool())
        .unwrap_or(false);

    if is_stream {
        return proxy_stream_request(
            state, upstream_body, model_config, api_key, upstream_real_name.to_string(),
            source_tag, start_time, start,
        )
        .await;
    }

    // ── 非流式请求 ──

    let client = http_client();
    let upstream_url = format!(
        "{}{}",
        model_config.api_base.trim_end_matches('/'),
        endpoint.upstream_path()
    );

    let mut request_builder = client
        .post(&upstream_url)
        .header("Authorization", format!("Bearer {}", api_key))
        .header("Content-Type", "application/json");

    // 透传安全请求头
    for header_name in FORWARD_HEADERS {
        if let Some(value) = headers.get(*header_name) {
            if let Ok(v) = value.to_str() {
                request_builder = request_builder.header(*header_name, v);
            }
        }
    }

    let response = request_builder
        .json(&upstream_body)
        .send()
        .await
        .map_err(|e| {
            if e.is_timeout() {
                ProxyError::UpstreamError("上游请求超时".into(), None)
            } else if e.is_connect() {
                ProxyError::UpstreamError(format!("无法连接到上游: {}", e), None)
            } else {
                ProxyError::UpstreamError(e.to_string(), None)
            }
        })?;

    let status_code = response.status();
    // 非流式请求：响应头到达时间即 TTFT
    let completion_start_time = chrono::Utc::now().to_rfc3339();
    let response_text = response
        .text()
        .await
        .map_err(|e| ProxyError::ParseError(format!("响应读取失败: {}", e)))?;

    let preview = if response_text.len() > 200 {
        response_text.chars().take(200).collect::<String>()
    } else {
        response_text.clone()
    };
    tracing::info!("上游响应 status={} len={} preview={}", status_code.as_u16(), response_text.len(), preview);

    let response_body: serde_json::Value = serde_json::from_str(&response_text)
        .map_err(|e| {
            if !status_code.is_success() {
                ProxyError::UpstreamError(
                    format!("上游返回 {}: {}", status_code.as_u16(), &response_text[..response_text.len().min(500)]),
                    None,
                )
            } else {
                ProxyError::ParseError(format!("响应 JSON 解析失败: {}", e))
            }
        })?;

    let end_time = chrono::Utc::now().to_rfc3339();
    let duration_ms = start.elapsed().as_millis() as i64;
    let usage = parser::parse_usage(&model_config.provider, &response_body);
    // 花费计算：缓存命中部分使用 cache_price，其余用 input_price
    let cache_price = if model_config.cache_price > 0.0 {
        model_config.cache_price
    } else {
        model_config.input_price
    };
    let uncached_prompt = usage.prompt_tokens.saturating_sub(usage.cached_tokens) as f64;
    let spend = (uncached_prompt / 1_000_000.0) * model_config.input_price
        + (usage.cached_tokens as f64 / 1_000_000.0) * cache_price
        + (usage.completion_tokens as f64 / 1_000_000.0) * model_config.output_price;
    let success = status_code.is_success();

    // 异步写入日志和统计（非流式）
    let db = state.db.clone();
    let mn = model_name.clone();
    let st = source_tag.clone();
    let log_entry = RequestLogEntry {
        id: uuid::Uuid::new_v4().to_string(),
        model_name: model_name.clone(),
        provider: model_config.provider.clone(),
        api_base: model_config.api_base.clone(),
        source_tag: source_tag.clone(),
        start_time: start_time.clone(),
        end_time: end_time.clone(),
        completion_start_time: Some(completion_start_time),
        duration_ms,
        total_tokens: usage.total_tokens as i64,
        prompt_tokens: usage.prompt_tokens as i64,
        completion_tokens: usage.completion_tokens as i64,
        cache_hit: usage.cache_hit,
        cache_key: usage.cache_key.clone(),
        cached_tokens: usage.cached_tokens as i64,
        spend,
        status: if success { "success" } else { "error" }.into(),
        messages: extract_messages_json(&body),
        response: Some(response_text),
        error_msg: if success { None } else { Some(format!("HTTP {}", status_code.as_u16())) },
    };

    tokio::spawn(async move {
        write_request_log(&db, &log_entry).await.ok();
        update_daily_stats(&db, &mn, &st, usage.total_tokens as i64,
            usage.prompt_tokens as i64, usage.completion_tokens as i64,
            usage.cache_hit, usage.cached_tokens as i64, spend).await.ok();
    });

    Ok(Response::builder()
        .status(status_code)
        .header("Content-Type", "application/json")
        .header("x-proxy-duration-ms", duration_ms.to_string())
        .body(axum::body::Body::from(
            serde_json::to_string(&response_body).unwrap_or_default(),
        ))
        .unwrap())
}

/// 执行 SSE 流式代理转发
async fn proxy_stream_request(
    state: &AppState,
    body: serde_json::Value,
    model_config: ModelConfigFull,
    api_key: String,
    model_name: String,
    source_tag: String,
    start_time: String,
    start: Instant,
) -> Result<Response, ProxyError> {
    let client = http_client();
    let upstream_url = format!(
        "{}/chat/completions",
        model_config.api_base.trim_end_matches('/')
    );

    let response = client
        .post(&upstream_url)
        .header("Authorization", format!("Bearer {}", api_key))
        .header("Content-Type", "application/json")
        .json(&body)
        .send()
        .await
        .map_err(|e| {
            if e.is_timeout() {
                ProxyError::UpstreamError("上游 SSE 请求超时".into(), None)
            } else if e.is_connect() {
                ProxyError::UpstreamError(format!("无法连接到上游: {}", e), None)
            } else {
                ProxyError::UpstreamError(e.to_string(), None)
            }
        })?;

    let status_code = response.status();

    if !status_code.is_success() {
        let error_body = response
            .text()
            .await
            .unwrap_or_else(|_| "Unknown error".into());

        let db = state.db.clone();
        let mn = model_name.clone();
        let st = source_tag.clone();
        let end_time = chrono::Utc::now().to_rfc3339();
        let duration_ms = start.elapsed().as_millis() as i64;

        let log_entry = RequestLogEntry {
            id: uuid::Uuid::new_v4().to_string(),
            model_name: mn.clone(),
            provider: model_config.provider.clone(),
            api_base: model_config.api_base.clone(),
            source_tag: st.clone(),
            start_time,
            end_time,
            completion_start_time: None,
            duration_ms,
            total_tokens: 0, prompt_tokens: 0, completion_tokens: 0,
            cache_hit: false, cache_key: None, cached_tokens: 0,
            spend: 0.0,
            status: "error".into(),
            messages: extract_messages_json(&body),
            response: Some(error_body.clone()),
            error_msg: Some(error_body.clone()),
        };

        tokio::spawn(async move {
            write_request_log(&db, &log_entry).await.ok();
            update_daily_stats(&db, &mn, &st, 0, 0, 0, false, 0, 0.0).await.ok();
        });

        return Err(ProxyError::UpstreamError(error_body, None));
    }

    // 流式转发
    let model_name_clone = model_name.clone();
    let provider = model_config.provider.clone();
    let api_base = model_config.api_base.clone();
    let input_price = model_config.input_price;
    let output_price = model_config.output_price;
    let cache_price = if model_config.cache_price > 0.0 {
        model_config.cache_price
    } else {
        model_config.input_price
    };
    let source_tag_clone = source_tag.clone();
    let db = state.db.clone();
    let body_json = serde_json::to_string(&body).unwrap_or_default();

    let stream = sse::sse_stream_forward(
        response,
        move |final_body: Option<serde_json::Value>, completion_start_time: Option<String>, error_msg: Option<String>| {
            let db = db.clone();
            let mn = model_name_clone.clone();
            let st = source_tag_clone.clone();
            let st_time = start_time.clone();

            async move {
                let end_time = chrono::Utc::now().to_rfc3339();
                let duration_ms = start.elapsed().as_millis() as i64;

                let (usage, status) = if let Some(ref body) = final_body {
                    let u = parser::parse_usage(&provider, body);
                    let s = if error_msg.is_some() { "error" } else { "success" };
                    (u, s)
                } else {
                    (UsageStats::default(), "error")
                };

                let uncached_prompt = usage.prompt_tokens.saturating_sub(usage.cached_tokens) as f64;
                let spend = (uncached_prompt / 1_000_000.0) * input_price
                    + (usage.cached_tokens as f64 / 1_000_000.0) * cache_price
                    + (usage.completion_tokens as f64 / 1_000_000.0) * output_price;

                let log_entry = RequestLogEntry {
                    id: uuid::Uuid::new_v4().to_string(),
                    model_name: mn.clone(),
                    provider: provider.clone(),
                    api_base: api_base.clone(),
                    source_tag: st.clone(),
                    start_time: st_time,
                    end_time,
                    completion_start_time,
                    duration_ms,
                    total_tokens: usage.total_tokens as i64,
                    prompt_tokens: usage.prompt_tokens as i64,
                    completion_tokens: usage.completion_tokens as i64,
                    cache_hit: usage.cache_hit,
                    cache_key: usage.cache_key,
                    cached_tokens: usage.cached_tokens as i64,
                    spend,
                    status: status.into(),
                    messages: serde_json::from_str::<serde_json::Value>(&body_json)
                        .ok()
                        .as_ref()
                        .and_then(|v| extract_messages_json(v)),
                    response: final_body.as_ref().map(|b| serde_json::to_string(b).unwrap_or_default()),
                    error_msg,
                };

                if let Err(e) = write_request_log(&db, &log_entry).await {
                    tracing::error!("SSE 日志写入失败: {}", e);
                }

                update_daily_stats(
                    &db, &mn, &st,
                    usage.total_tokens as i64,
                    usage.prompt_tokens as i64,
                    usage.completion_tokens as i64,
                    usage.cache_hit,
                    usage.cached_tokens as i64,
                    spend,
                ).await.ok();
            }
        },
    );

    Ok(Response::builder()
        .header("Content-Type", "text/event-stream")
        .header("Cache-Control", "no-cache")
        .header("Connection", "keep-alive")
        .header("X-Accel-Buffering", "no")
        .body(axum::body::Body::from_stream(stream))
        .unwrap())
}
