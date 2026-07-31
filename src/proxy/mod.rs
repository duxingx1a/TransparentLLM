//! 代理引擎模块
//!
//! 负责 HTTP/SSE 请求转发到上游 LLM 提供商

pub mod parser;
pub mod sse;

use std::sync::OnceLock;
use std::time::{Duration, Instant};

use axum::http::{HeaderMap, StatusCode};
use axum::response::{IntoResponse, Response};

use crate::logging::{DailyStatsUpdate, RequestLogEntry};
use crate::models::{ModelConfigFull, decrypt_api_key};
use crate::source_tag::{parse_source_tag, detect_source_from_body};
use crate::AppState;

use self::parser::UsageStats;

/// 上游请求超时（10 分钟）
const UPSTREAM_TIMEOUT: Duration = Duration::from_secs(600);

/// 转发给上游的安全请求头（不转发 accept-encoding，让 reqwest 自动解压）
const FORWARD_HEADERS: &[&str] = &[
    "accept",
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
            .pool_max_idle_per_host(10)
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

/// 保存完整请求体 JSON
fn extract_request_json(body: &serde_json::Value) -> Option<String> {
    serde_json::to_string(body).ok()
}

/// 将 SSE 流式响应解析为标准 JSON 值（兼容某些提供商在 stream=false 时返回 SSE 格式）
fn parse_sse_as_value(response_text: &str) -> Option<serde_json::Value> {
    // 检查是否是 SSE 格式（以 "data:" 开头）
    let has_sse = response_text.lines().any(|l| l.trim_start().starts_with("data:"));
    if !has_sse {
        return None;
    }

    let mut content = String::new();
    let mut reasoning = String::new();
    let mut model = String::new();
    let mut usage = serde_json::json!({});
    let mut found_any = false;

    for line in response_text.lines() {
        let line = line.trim();
        if !line.starts_with("data:") {
            continue;
        }
        let data = line[5..].trim();
        if data == "[DONE]" {
            continue;
        }
        if let Ok(chunk) = serde_json::from_str::<serde_json::Value>(data) {
            found_any = true;
            if let Some(delta) = chunk["choices"][0].get("delta") {
                if let Some(c) = delta.get("content").and_then(|v| v.as_str()) {
                    content.push_str(c);
                }
                if let Some(r) = delta.get("reasoning_content").and_then(|v| v.as_str()) {
                    reasoning.push_str(r);
                }
            }
            if let Some(m) = chunk.get("model").and_then(|v| v.as_str()) {
                if model.is_empty() {
                    model = m.to_string();
                }
            }
            if let Some(u) = chunk.get("usage") {
                if u.get("total_tokens").and_then(|v| v.as_u64()).unwrap_or(0) > 0 {
                    usage = u.clone();
                }
            }
        }
    }

    if !found_any {
        return None;
    }

    // 构建标准 OpenAI 格式的 JSON 响应
    let message = if !reasoning.is_empty() {
        serde_json::json!({"content": content, "reasoning": reasoning})
    } else {
        serde_json::json!({"content": content})
    };

    Some(serde_json::json!({
        "id": "sse-parsed",
        "model": model,
        "choices": [{
            "index": 0,
            "message": message,
            "finish_reason": "stop"
        }],
        "usage": usage,
    }))
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

    // 从缓存查找模型（key: "{provider}-{model_name}"）
    // 缓存由 AppState 维护，启动时加载，CRUD 操作后自动重建
    let model_config = {
        let cache = state.model_cache.read().unwrap();
        cache.get(&model_name).cloned()
    };

    let model_config = match model_config {
        Some(cfg) => cfg,
        None => {
            // 记录错误日志
            let err_source_tag = match detect_source_from_body(&body) {
                Some(tag) => tag.to_string(),
                None => parse_source_tag(
                    headers.get("user-agent").and_then(|v| v.to_str().ok()).unwrap_or(""),
                    headers.get("x-source").and_then(|v| v.to_str().ok()).unwrap_or(""),
                ).to_string(),
            };
            let log_entry = RequestLogEntry {
                id: uuid::Uuid::new_v4().to_string(),
                model_name: model_name.clone(),
                provider: String::new(),
                api_base: String::new(),
                source_tag: err_source_tag,
                start_time: start_time.clone(),
                end_time: chrono::Utc::now().to_rfc3339(),
                completion_start_time: None,
                duration_ms: start.elapsed().as_millis() as i64,
                total_tokens: 0, prompt_tokens: 0, completion_tokens: 0,
                cache_hit: false, cache_key: None, cached_tokens: 0,
                spend: 0.0,
                status: "error".into(),
                messages: extract_request_json(&body),
                response: None,
                error_msg: Some(format!("模型未配置: {}", model_name)),
                tokens_per_second: 0.0,
            };
            state.logger.write_log(log_entry);
            return Err(ProxyError::ModelNotFound(model_name));
        }
    };

    let mut api_key = decrypt_api_key(&model_config.encrypted_api_key, &state.config.encryption_key)
        .map_err(|e| {
            // 记录错误日志
            let err_source_tag = match detect_source_from_body(&body) {
                Some(tag) => tag.to_string(),
                None => parse_source_tag(
                    headers.get("user-agent").and_then(|v| v.to_str().ok()).unwrap_or(""),
                    headers.get("x-source").and_then(|v| v.to_str().ok()).unwrap_or(""),
                ).to_string(),
            };
            let log_entry = RequestLogEntry {
                id: uuid::Uuid::new_v4().to_string(),
                model_name: model_name.clone(),
                provider: model_config.provider.clone(),
                api_base: model_config.api_base.clone(),
                source_tag: err_source_tag,
                start_time: start_time.clone(),
                end_time: chrono::Utc::now().to_rfc3339(),
                completion_start_time: None,
                duration_ms: start.elapsed().as_millis() as i64,
                total_tokens: 0, prompt_tokens: 0, completion_tokens: 0,
                cache_hit: false, cache_key: None, cached_tokens: 0,
                spend: 0.0,
                status: "error".into(),
                messages: extract_request_json(&body),
                response: None,
                error_msg: Some(format!("Key 解密失败: {}", e)),
                tokens_per_second: 0.0,
            };
            state.logger.write_log(log_entry);
            ProxyError::UpstreamError(format!("Key 解密失败: {}", e), None)
        })?;

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
            model_config.model_name.clone()
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
    let x_source = headers
        .get("x-source")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("");
    // 先从头解析来源，再检查请求体中有无特征签名覆盖
    let mut source_tag = parse_source_tag(user_agent, x_source).to_string();
    if source_tag == "unknown" {
        if let Some(body_tag) = detect_source_from_body(&body) {
            source_tag = body_tag.to_string();
        }
    }

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

    // 记录请求体大小（用于排查上游 413 问题）
    let body_size = serde_json::to_string(&upstream_body).map(|s| s.len()).unwrap_or(0);
    tracing::info!(
        "转发请求 model={} upstream={} body_size={} bytes ({:.2} MB)",
        model_config.model_name, upstream_url, body_size, body_size as f64 / 1_048_576.0
    );

    let response = request_builder
        .json(&upstream_body)
        .send()
        .await
        .map_err(|e| {
            let err_msg = if e.is_timeout() {
                "上游请求超时".to_string()
            } else if e.is_connect() {
                format!("无法连接到上游: {}", e)
            } else {
                e.to_string()
            };
            // 记录错误日志
            let log_entry = RequestLogEntry {
                id: uuid::Uuid::new_v4().to_string(),
                model_name: model_config.model_name.clone(),
                provider: model_config.provider.clone(),
                api_base: model_config.api_base.clone(),
                source_tag: source_tag.clone(),
                start_time: start_time.clone(),
                end_time: chrono::Utc::now().to_rfc3339(),
                completion_start_time: None,
                duration_ms: start.elapsed().as_millis() as i64,
                total_tokens: 0, prompt_tokens: 0, completion_tokens: 0,
                cache_hit: false, cache_key: None, cached_tokens: 0,
                spend: 0.0,
                status: "error".into(),
                messages: extract_request_json(&body),
                response: None,
                error_msg: Some(err_msg.clone()),
                tokens_per_second: 0.0,
            };
            state.logger.write_log(log_entry);
            ProxyError::UpstreamError(err_msg, None)
        })?;

    let status_code = response.status();
    // 非流式请求：上游一次性返回完整响应，不存在 TTFT 概念，置 None
    // （若记录响应头到达时间，会等于总耗时，导致速率兜底被 .max(1) 放大）
    let completion_start_time: Option<String> = None;
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

    let response_body: serde_json::Value = match serde_json::from_str::<serde_json::Value>(&response_text) {
        Ok(v) => v,
        Err(e) => {
            if !status_code.is_success() {
                // 非 200 响应且无法解析 JSON —— 先写日志再返回错误
                let err_detail = format!("上游返回 {}: {}", status_code.as_u16(), &response_text[..response_text.len().min(500)]);
                let log_entry = RequestLogEntry {
                    id: uuid::Uuid::new_v4().to_string(),
                    model_name: model_config.model_name.clone(),
                    provider: model_config.provider.clone(),
                    api_base: model_config.api_base.clone(),
                    source_tag: source_tag.clone(),
                    start_time: start_time.clone(),
                    end_time: chrono::Utc::now().to_rfc3339(),
                    completion_start_time: completion_start_time.clone(),
                    duration_ms: start.elapsed().as_millis() as i64,
                    total_tokens: 0, prompt_tokens: 0, completion_tokens: 0,
                    cache_hit: false, cache_key: None, cached_tokens: 0,
                    spend: 0.0,
                    status: "error".into(),
                    messages: extract_request_json(&body),
                    response: Some(response_text.clone()),
                    error_msg: Some(err_detail.clone()),
                    tokens_per_second: 0.0,
                };
                state.logger.write_log(log_entry);
                return Err(ProxyError::UpstreamError(err_detail, None));
            }
            // 尝试解析 SSE 流式格式（某些提供商在 stream=false 时也返回 SSE）
            match parse_sse_as_value(&response_text) {
                Some(v) => v,
                None => return Err(ProxyError::ParseError(format!("响应 JSON 解析失败: {}", e))),
            }
        }
    };

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

    let tps = if usage.tokens_per_second > 0.0 {
        usage.tokens_per_second
    } else if usage.completion_tokens > 0 && duration_ms > 0 {
        // 用 completion_tokens / (总耗时 - TTFT) 计算输出速率
        // 非流式请求 TTFT 为 None → ttft_ms=0 → 输出耗时 = 总耗时（decode 时长）
        let ttft_ms = completion_start_time
            .as_deref()
            .and_then(|ct| chrono::DateTime::parse_from_rfc3339(ct).ok())
            .and_then(|ct| {
                chrono::DateTime::parse_from_rfc3339(&start_time)
                    .ok()
                    .map(|st| (ct - st).num_milliseconds())
            })
            .unwrap_or(0);
        let output_ms = (duration_ms - ttft_ms).max(1) as f64;
        usage.completion_tokens as f64 / (output_ms / 1000.0)
    } else {
        0.0
    };
    let log_entry = RequestLogEntry {
        id: uuid::Uuid::new_v4().to_string(),
        model_name: model_config.model_name.clone(),
        provider: model_config.provider.clone(),
        api_base: model_config.api_base.clone(),
        source_tag: source_tag.clone(),
        start_time: start_time.clone(),
        end_time: end_time.clone(),
        completion_start_time,
        duration_ms,
        total_tokens: usage.total_tokens as i64,
        prompt_tokens: usage.prompt_tokens as i64,
        completion_tokens: usage.completion_tokens as i64,
        cache_hit: usage.cache_hit,
        cache_key: usage.cache_key.clone(),
        cached_tokens: usage.cached_tokens as i64,
        spend,
        status: if success { "success" } else { "error" }.into(),
        messages: extract_request_json(&body),
        response: Some(response_text),
        error_msg: if success { None } else { Some(format!("HTTP {}", status_code.as_u16())) },
        tokens_per_second: tps,
    };

    // 通过批量写入器入队（非阻塞，后台每 15s flush 一次）
    state.logger.write_log(log_entry);
    state.logger.update_stats(DailyStatsUpdate {
        model_name: model_config.model_name.clone(),
        source_tag: source_tag.clone(),
        total_tokens: usage.total_tokens as i64,
        prompt_tokens: usage.prompt_tokens as i64,
        completion_tokens: usage.completion_tokens as i64,
        cache_hit: usage.cache_hit,
        cached_tokens: usage.cached_tokens as i64,
        spend,
        is_error: !success,
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
    _model_name: String,
    source_tag: String,
    start_time: String,
    start: Instant,
) -> Result<Response, ProxyError> {
    let client = http_client();
    let upstream_url = format!(
        "{}/chat/completions",
        model_config.api_base.trim_end_matches('/')
    );

    // 记录请求体大小（用于排查上游 413 问题）
    let body_size = serde_json::to_string(&body).map(|s| s.len()).unwrap_or(0);
    tracing::info!(
        "SSE 转发请求 model={} upstream={} body_size={} bytes ({:.2} MB)",
        model_config.model_name, upstream_url, body_size, body_size as f64 / 1_048_576.0
    );

    let response = client
        .post(&upstream_url)
        .header("Authorization", format!("Bearer {}", api_key))
        .header("Content-Type", "application/json")
        .json(&body)
        .send()
        .await
        .map_err(|e| {
            let err_msg = if e.is_timeout() {
                "上游 SSE 请求超时".to_string()
            } else if e.is_connect() {
                format!("无法连接到上游: {}", e)
            } else {
                e.to_string()
            };
            // 记录错误日志
            let log_entry = RequestLogEntry {
                id: uuid::Uuid::new_v4().to_string(),
                model_name: model_config.model_name.clone(),
                provider: model_config.provider.clone(),
                api_base: model_config.api_base.clone(),
                source_tag: source_tag.clone(),
                start_time: start_time.clone(),
                end_time: chrono::Utc::now().to_rfc3339(),
                completion_start_time: None,
                duration_ms: start.elapsed().as_millis() as i64,
                total_tokens: 0, prompt_tokens: 0, completion_tokens: 0,
                cache_hit: false, cache_key: None, cached_tokens: 0,
                spend: 0.0,
                status: "error".into(),
                messages: extract_request_json(&body),
                response: None,
                error_msg: Some(err_msg.clone()),
                tokens_per_second: 0.0,
            };
            state.logger.write_log(log_entry);
            ProxyError::UpstreamError(err_msg, None)
        })?;

    let status_code = response.status();

    if !status_code.is_success() {
        let error_body = response
            .text()
            .await
            .unwrap_or_else(|_| "Unknown error".into());

        let mn = model_config.model_name.clone();
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
            messages: extract_request_json(&body),
            response: Some(error_body.clone()),
            error_msg: Some(error_body.clone()),
            tokens_per_second: 0.0,
        };

        state.logger.write_log(log_entry);
        state.logger.update_stats(DailyStatsUpdate {
            model_name: mn,
            source_tag: st,
            total_tokens: 0, prompt_tokens: 0, completion_tokens: 0,
            cache_hit: false, cached_tokens: 0, spend: 0.0, is_error: true,
        });

        return Err(ProxyError::UpstreamError(error_body, None));
    }

    // 流式转发
    let model_name_clone = model_config.model_name.clone();
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
    let logger = state.logger.clone();
    let body_json = serde_json::to_string(&body).unwrap_or_default();

    let stream = sse::sse_stream_forward(
        response,
        move |final_body: Option<serde_json::Value>, completion_start_time: Option<String>, error_msg: Option<String>| {
            let logger = logger.clone();
            let mn = model_name_clone.clone();
            let st = source_tag_clone.clone();
            let st_time = start_time.clone();

            async move {
                let end_time = chrono::Utc::now().to_rfc3339();
                let duration_ms = start.elapsed().as_millis() as i64;

                let is_error = error_msg.is_some();
                let (usage, status) = if let Some(ref body) = final_body {
                    let u = parser::parse_usage(&provider, body);
                    let s = if is_error { "error" } else { "success" };
                    (u, s)
                } else {
                    (UsageStats::default(), "error")
                };

                let uncached_prompt = usage.prompt_tokens.saturating_sub(usage.cached_tokens) as f64;
                let spend = (uncached_prompt / 1_000_000.0) * input_price
                    + (usage.cached_tokens as f64 / 1_000_000.0) * cache_price
                    + (usage.completion_tokens as f64 / 1_000_000.0) * output_price;

                // 速率兜底：优先用上游返回值，否则用 completion_tokens / (总耗时 - TTFT)
                let tps = if usage.tokens_per_second > 0.0 {
                    usage.tokens_per_second
                } else if usage.completion_tokens > 0 && duration_ms > 0 {
                    let ttft_ms = completion_start_time
                        .as_deref()
                        .and_then(|ct| chrono::DateTime::parse_from_rfc3339(ct).ok())
                        .and_then(|ct| {
                            chrono::DateTime::parse_from_rfc3339(&st_time)
                                .ok()
                                .map(|st| (ct - st).num_milliseconds())
                        })
                        .unwrap_or(0);
                    let output_ms = (duration_ms - ttft_ms).max(1) as f64;
                    usage.completion_tokens as f64 / (output_ms / 1000.0)
                } else {
                    0.0
                };

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
                        .and_then(|v| extract_request_json(v)),
                    response: final_body.as_ref().map(|b| serde_json::to_string(b).unwrap_or_default()),
                    error_msg,
                    tokens_per_second: tps,
                };

                logger.write_log(log_entry);
                logger.update_stats(DailyStatsUpdate {
                    model_name: mn,
                    source_tag: st,
                    total_tokens: usage.total_tokens as i64,
                    prompt_tokens: usage.prompt_tokens as i64,
                    completion_tokens: usage.completion_tokens as i64,
                    cache_hit: usage.cache_hit,
                    cached_tokens: usage.cached_tokens as i64,
                    spend,
                    is_error,
                });
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
