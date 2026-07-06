//! 管理 API 路由
//!
//! 前端面板调用的管理接口

use std::sync::Arc;

use axum::{
    Router,
    extract::{Path, Query, State},
    http::{HeaderMap, StatusCode},
    response::IntoResponse,
    routing::{get, post},
    Json,
};
use serde::{Deserialize, Serialize};

use crate::AppState;

/// 从 OpenAI 格式的响应中提取回复文本（兼容 content / reasoning / reasoning_content）
fn extract_reply_text(json: &serde_json::Value) -> String {
    let msg = match json.get("choices").and_then(|c| c.get(0)).and_then(|c| c.get("message")) {
        Some(m) => m,
        None => return String::new(),
    };
    // 优先取 content
    if let Some(text) = msg.get("content").and_then(|v| v.as_str()) {
        if !text.is_empty() { return text.to_string(); }
    }
    // 尝试 reasoning 字段
    for field in &["reasoning", "reasoning_content"] {
        if let Some(text) = msg.get(*field).and_then(|v| v.as_str()) {
            if !text.is_empty() { return text.to_string(); }
        }
    }
    String::new()
}

/// 从响应中分别提取「思考过程」和「最终回复」
fn extract_thinking_and_reply(json: &serde_json::Value) -> (String, String) {
    let msg = match json.get("choices").and_then(|c| c.get(0)).and_then(|c| c.get("message")) {
        Some(m) => m,
        None => return (String::new(), String::new()),
    };
    // 思考过程：优先 reasoning，再 reasoning_content
    let thinking = ["reasoning", "reasoning_content"].iter().find_map(|&f| {
        msg.get(f).and_then(|v| v.as_str()).filter(|s| !s.is_empty()).map(|s| s.to_string())
    }).unwrap_or_default();
    // 最终回复：content
    let reply = msg.get("content").and_then(|v| v.as_str())
        .filter(|s| !s.is_empty())
        .map(|s| s.to_string())
        .unwrap_or_default();
    (thinking, reply)
}

pub fn management_routes() -> Router<Arc<AppState>> {
    Router::new()
        // 认证
        .route("/api/auth/login", post(auth_login))
        .route("/api/auth/check", get(auth_check))
        .route("/api/auth/logout", post(auth_logout))
        // 模型管理
        .route("/api/models", get(list_models).post(create_model))
        .route(
            "/api/models/:id",
            get(get_model).put(update_model).delete(delete_model),
        )
        .route("/api/models/:id/test", post(test_model))
        .route("/api/models/recalculate-spend", post(recalculate_spend))
        // 提供商管理
        .route("/api/providers", get(list_providers).post(create_provider))
        .route(
            "/api/providers/:id",
            get(get_provider).put(update_provider).delete(delete_provider),
        )
        .route("/api/providers/:id/models", get(get_provider_models))
        // Playground
        .route("/api/playground/chat", post(playground_chat))
        .route("/api/playground/endpoints", get(playground_endpoints))
        // 日志
        .route("/api/logs", get(list_logs))
        .route("/api/logs/:id", get(get_log_detail))
        // 统计
        .route("/api/stats/overview", get(get_stats_overview))
        .route("/api/stats/daily", get(get_stats_daily))
        // 来源标签
        .route("/api/source-tags", get(get_source_tags))
        // 设置
        .route("/api/settings", get(get_settings).put(update_settings))
}

// ── 模型管理 ──

#[derive(Debug, Serialize)]
struct ModelListResponse {
    models: Vec<crate::models::ModelConfig>,
}

async fn list_models(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
) -> impl IntoResponse {
    if let Err(resp) = crate::auth::middleware::check_auth(&state, &headers) {
        return resp;
    }
    match crate::models::list_models(&state.db).await {
        Ok(mut models) => {
            // 解密每个模型的 api_key 供前端展示
            for model in &mut models {
                if !model.encrypted_api_key.is_empty() {
                    model.decrypted_api_key = crate::models::decrypt_api_key(
                        &model.encrypted_api_key,
                        &state.config.encryption_key,
                    )
                    .unwrap_or_default();
                }
                // 如果 api_key 是占位符，替换为提供商的真实 key
                if model.decrypted_api_key == "auto-from-provider" {
                    if let Ok(Some(prov)) = crate::models::get_provider_by_name(
                        &state.db, &model.provider,
                    ).await {
                        model.decrypted_api_key = crate::models::decrypt_api_key(
                            &prov.encrypted_api_key,
                            &state.config.encryption_key,
                        )
                        .unwrap_or_default();
                    }
                }
            }
            Json(ModelListResponse { models }).into_response()
        }
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({"error": e.to_string()})),
        )
            .into_response(),
    }
}

async fn get_model(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Path(id): Path<String>,
) -> impl IntoResponse {
    if let Err(resp) = crate::auth::middleware::check_auth(&state, &headers) {
        return resp;
    }
    match crate::models::get_model(&state.db, &id).await {
        Ok(Some(mut model)) => {
            if !model.encrypted_api_key.is_empty() {
                model.decrypted_api_key = crate::models::decrypt_api_key(
                    &model.encrypted_api_key,
                    &state.config.encryption_key,
                )
                .unwrap_or_default();
            }
            Json(model).into_response()
        }
        Ok(None) => (
            StatusCode::NOT_FOUND,
            Json(serde_json::json!({"error": "模型不存在"})),
        )
            .into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({"error": e.to_string()})),
        )
            .into_response(),
    }
}

async fn create_model(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(req): Json<crate::models::CreateModelRequest>,
) -> impl IntoResponse {
    if let Err(resp) = crate::auth::middleware::check_auth(&state, &headers) {
        return resp;
    }
    match crate::models::create_model(&state.db, req, &state.config.encryption_key).await {
        Ok(model) => (StatusCode::CREATED, Json(model)).into_response(),
        Err(e) => {
            let msg = e.to_string();
            let code = if msg.contains("UNIQUE constraint") {
                StatusCode::CONFLICT
            } else {
                StatusCode::INTERNAL_SERVER_ERROR
            };
            (code, Json(serde_json::json!({"error": msg}))).into_response()
        }
    }
}

async fn update_model(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Path(id): Path<String>,
    Json(req): Json<crate::models::UpdateModelRequest>,
) -> impl IntoResponse {
    if let Err(resp) = crate::auth::middleware::check_auth(&state, &headers) {
        return resp;
    }
    // 检查是否有价格字段变更
    let price_changed = req.input_price.is_some() || req.output_price.is_some() || req.cache_price.is_some();
    match crate::models::update_model(&state.db, &id, req, &state.config.encryption_key).await {
        Ok(Some(model)) => {
            // 价格变更时自动重算历史日志花费
            if price_changed {
                let db = state.db.clone();
                tokio::spawn(async move { do_recalculate_spend(&db).await; });
            }
            Json(model).into_response()
        }
        Ok(None) => (
            StatusCode::NOT_FOUND,
            Json(serde_json::json!({"error": "模型不存在"})),
        )
            .into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({"error": e.to_string()})),
        )
            .into_response(),
    }
}

async fn delete_model(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Path(id): Path<String>,
) -> impl IntoResponse {
    if let Err(resp) = crate::auth::middleware::check_auth(&state, &headers) {
        return resp;
    }
    match crate::models::delete_model(&state.db, &id).await {
        Ok(true) => Json(serde_json::json!({"success": true})).into_response(),
        Ok(false) => (
            StatusCode::NOT_FOUND,
            Json(serde_json::json!({"error": "模型不存在"})),
        )
            .into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({"error": e.to_string()})),
        )
            .into_response(),
    }
}

// ── 模型连通性测试 ──

#[derive(Debug, Deserialize)]
struct TestModelRequest {
    #[serde(default = "default_test_message")]
    message: String,
    #[serde(default)]
    stream: bool,
}

fn default_test_message() -> String {
    "你好，请用一句话介绍自己".into()
}

/// POST /api/models/:id/test — 测试模型连通性
async fn test_model(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Path(id): Path<String>,
    Json(req): Json<TestModelRequest>,
) -> impl IntoResponse {
    if let Err(resp) = crate::auth::middleware::check_auth(&state, &headers) {
        return resp;
    }

    // 查找模型
    let model = match crate::models::get_model(&state.db, &id).await {
        Ok(Some(m)) => m,
        Ok(None) => return (StatusCode::NOT_FOUND, Json(serde_json::json!({"error": "模型不存在"}))).into_response(),
        Err(e) => return (StatusCode::INTERNAL_SERVER_ERROR, Json(serde_json::json!({"error": e.to_string()}))).into_response(),
    };

    let body = serde_json::json!({
        "model": model.model_name,
        "messages": [{"role": "user", "content": req.message}],
        "stream": req.stream,
        "max_tokens": 100,
    });

    match crate::proxy::proxy_request(&state, body, &headers, crate::proxy::EndpointKind::Chat).await {
        Ok(response) => response,
        Err(e) => e.into_response(),
    }
}

/// POST /api/models/recalculate-spend — 价格变更后重新计算所有日志的花费
///
/// 遍历所有 request_logs，根据当前模型价格重新计算 spend 字段，
/// 同时更新 daily_stats 聚合表。
/// 核心重算逻辑（被 update_model 和 recalculate_spend 共用）
async fn do_recalculate_spend(db: &sqlx::PgPool) {
    // 1. 获取所有模型的当前价格
    let models = crate::models::list_models(db).await.unwrap_or_default();
    let price_map: std::collections::HashMap<String, (f64, f64, f64)> = models
        .into_iter()
        .map(|m| (m.model_name.clone(), (m.input_price, m.output_price, m.cache_price)))
        .collect();

    // 2. 清空 daily_stats，稍后重建
    sqlx::query("DELETE FROM daily_stats").execute(db).await.ok();

    // 3. 修正 request_logs 中的 model_name（去掉 provider 前缀）
    sqlx::query(
        "UPDATE request_logs SET model_name = regexp_replace(model_name, '^[^-]+-', '') \
         WHERE regexp_replace(model_name, '^[^-]+-', '') IN (SELECT model_name FROM models)"
    )
    .execute(db)
    .await
    .ok();

    // 4. 重新计算每条 request_logs 的 spend
    let logs = sqlx::query_as::<_, (String, String, String, i64, i64, i64, i64, i32, String, String, String, String, String, f64)>(
        "SELECT id, model_name, provider, prompt_tokens, completion_tokens, cached_tokens, total_tokens, cache_hit, source_tag, start_time, end_time, completion_start_time, status, spend FROM request_logs"
    )
    .fetch_all(db)
    .await
    .unwrap_or_default();

    for (id, model_name, _provider, prompt_tokens, completion_tokens, cached_tokens, _total_tokens, cache_hit, source_tag, start_time, _end_time, _completion_start_time, _status, _old_spend) in &logs {
        let new_spend = if let Some((input_price, output_price, cache_price)) = price_map.get(model_name) {
            let uncached = (*prompt_tokens as f64) - (*cached_tokens as f64);
            let uncached = uncached.max(0.0);
            (uncached / 1_000_000.0) * input_price
                + (*cached_tokens as f64 / 1_000_000.0) * *cache_price
                + (*completion_tokens as f64 / 1_000_000.0) * output_price
        } else {
            0.0
        };

        sqlx::query("UPDATE request_logs SET spend = $1 WHERE id = $2")
            .bind(new_spend)
            .bind(id)
            .execute(db)
            .await
            .ok();

        let date = &start_time[..10];
        let cache_hit_bool = *cache_hit != 0;
        sqlx::query(
            "INSERT INTO daily_stats (date, model_name, source_tag, total_requests, total_tokens, prompt_tokens, completion_tokens, cache_hits, cached_tokens, total_spend, failed_requests) \
             VALUES ($1, $2, $3, 1, $8, $4, $5, $6::bigint, $7, $9, 0) \
             ON CONFLICT (date, model_name, source_tag) DO UPDATE SET \
             total_requests = daily_stats.total_requests + 1, \
             total_tokens = daily_stats.total_tokens + EXCLUDED.total_tokens, \
             prompt_tokens = daily_stats.prompt_tokens + EXCLUDED.prompt_tokens, \
             completion_tokens = daily_stats.completion_tokens + EXCLUDED.completion_tokens, \
             cache_hits = daily_stats.cache_hits + EXCLUDED.cache_hits, \
             cached_tokens = daily_stats.cached_tokens + EXCLUDED.cached_tokens, \
             total_spend = daily_stats.total_spend + EXCLUDED.total_spend"
        )
        .bind(date)
        .bind(&model_name)
        .bind(&source_tag)
        .bind(prompt_tokens)
        .bind(completion_tokens)
        .bind(if cache_hit_bool { 1i64 } else { 0i64 })
        .bind(cached_tokens)
        .bind(prompt_tokens + completion_tokens)
        .bind(new_spend)
        .execute(db)
        .await
        .ok();
    }
}

async fn recalculate_spend(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
) -> impl IntoResponse {
    if let Err(resp) = crate::auth::middleware::check_auth(&state, &headers) {
        return resp;
    }
    do_recalculate_spend(&state.db).await;
    Json(serde_json::json!({
        "success": true,
        "message": "已重新计算所有日志的花费"
    })).into_response()
}

// ── Playground ──

#[derive(Debug, Deserialize)]
struct PlaygroundRequest {
    model_name: String,
    messages: Vec<serde_json::Value>,
    #[serde(default)]
    stream: bool,
    #[serde(default)]
    temperature: Option<f64>,
    #[serde(default)]
    max_tokens: Option<u32>,
    /// 端点类型，默认 chat
    #[serde(default = "default_endpoint_type")]
    endpoint_type: String,
    /// 系统提示词
    #[serde(default)]
    system_prompt: Option<String>,
    /// 对比模式：同时调用的模型列表
    #[serde(default)]
    compare_models: Vec<String>,
}

fn default_endpoint_type() -> String { "chat".into() }

/// GET /api/playground/endpoints — 可用端点列表
async fn playground_endpoints(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
) -> impl IntoResponse {
    if let Err(resp) = crate::auth::middleware::check_auth(&state, &headers) {
        return resp;
    }
    Json(serde_json::json!([
        {"id": "chat", "name": "对话补全", "path": "/v1/chat/completions"},
        {"id": "embedding", "name": "文本嵌入", "path": "/v1/embeddings"},
        {"id": "image", "name": "图像生成", "path": "/v1/images/generations"},
        {"id": "audio", "name": "音频转录", "path": "/v1/audio/transcriptions"},
    ])).into_response().into_response()
}

/// POST /api/playground/chat — Playground 对话
async fn playground_chat(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(req): Json<PlaygroundRequest>,
) -> impl IntoResponse {
    if let Err(resp) = crate::auth::middleware::check_auth(&state, &headers) {
        return resp;
    }

    let endpoint = match req.endpoint_type.as_str() {
        "embedding" => crate::proxy::EndpointKind::Embeddings,
        "image" => crate::proxy::EndpointKind::Images,
        "audio" => crate::proxy::EndpointKind::Audio,
        _ => crate::proxy::EndpointKind::Chat,
    };

    // 构建消息列表（支持 system_prompt）
    let mut messages = req.messages.clone();
    if let Some(sys) = &req.system_prompt {
        if !sys.is_empty() && !messages.iter().any(|m| m.get("role").and_then(|r| r.as_str()) == Some("system")) {
            messages.insert(0, serde_json::json!({"role": "system", "content": sys}));
        }
    }

    let start = std::time::Instant::now();

    // 对比模式
    if !req.compare_models.is_empty() {
        return playground_compare(&state, &headers, &req, messages, &start).await;
    }

    let body = serde_json::json!({
        "model": req.model_name,
        "messages": messages,
        "stream": req.stream,
        "temperature": req.temperature.unwrap_or(0.7),
        "max_tokens": req.max_tokens.unwrap_or(2048),
    });

    // 流式 → 透传到上游
    if req.stream {
        return match crate::proxy::proxy_request(&state, body, &headers, endpoint).await {
            Ok(resp) => resp,
            Err(e) => e.into_response(),
        };
    }

    // 非流式 → 结构化返回
    match crate::proxy::proxy_request(&state, body, &headers, endpoint).await {
        Ok(response) => {
            let duration_ms = start.elapsed().as_millis() as u64;
            // 尝试解析响应提取内容
            let body_bytes = axum::body::to_bytes(response.into_body(), 1024 * 1024).await.unwrap_or_default();
            let body_str = String::from_utf8_lossy(&body_bytes);

            if let Ok(json) = serde_json::from_str::<serde_json::Value>(&body_str) {
                let content = extract_reply_text(&json);
                let usage = &json["usage"];
                return Json(serde_json::json!({
                    "success": true,
                    "content": content,
                    "model": json["model"],
                    "usage": {
                        "prompt_tokens": usage["prompt_tokens"].as_u64().unwrap_or(0),
                        "completion_tokens": usage["completion_tokens"].as_u64().unwrap_or(0),
                        "total_tokens": usage["total_tokens"].as_u64().unwrap_or(0),
                    },
                    "duration_ms": duration_ms,
                    "raw_response": json,
                })).into_response();
            }
            // 非 JSON → 原样返回
            (axum::http::StatusCode::OK, body_str.to_string()).into_response()
        }
        Err(e) => e.into_response(),
    }
}

/// 对比模式：同时调用多个模型
async fn playground_compare(
    state: &crate::AppState,
    headers: &HeaderMap,
    req: &PlaygroundRequest,
    messages: Vec<serde_json::Value>,
    start: &std::time::Instant,
) -> axum::response::Response {
    let mut results = Vec::new();
    let endpoint = crate::proxy::EndpointKind::Chat; // 对比只支持 chat

    for model_name in &req.compare_models {
        let body = serde_json::json!({
            "model": model_name,
            "messages": messages,
            "stream": false,
            "temperature": req.temperature.unwrap_or(0.7),
            "max_tokens": req.max_tokens.unwrap_or(2048),
        });

        let model_start = std::time::Instant::now();
        match crate::proxy::proxy_request(state, body, headers, endpoint.clone()).await {
            Ok(response) => {
                let duration_ms = model_start.elapsed().as_millis() as u64;
                let body_bytes = axum::body::to_bytes(response.into_body(), 1024 * 1024).await.unwrap_or_default();
                let body_str = String::from_utf8_lossy(&body_bytes);
                if let Ok(json) = serde_json::from_str::<serde_json::Value>(&body_str) {
                    // 提取回复内容（兼容 content / reasoning / reasoning_content）
                    let content = extract_reply_text(&json);
                    results.push(serde_json::json!({
                        "model_name": model_name,
                        "success": true,
                        "content": content,
                        "usage": json["usage"],
                        "duration_ms": duration_ms,
                    }));
                } else {
                    results.push(serde_json::json!({
                        "model_name": model_name,
                        "success": false,
                        "error": body_str.to_string(),
                        "duration_ms": duration_ms,
                    }));
                }
            }
            Err(e) => {
                results.push(serde_json::json!({
                    "model_name": model_name,
                    "success": false,
                    "error": format!("{:?}", e),
                }));
            }
        }
    }

    let total_ms = start.elapsed().as_millis() as u64;
    Json(serde_json::json!({
        "results": results,
        "total_duration_ms": total_ms,
        "compare_mode": true,
    })).into_response()
}

// ── 日志查询 ──

#[derive(Debug, Deserialize)]
struct LogQueryParams {
    #[serde(default = "default_page")]
    page: u32,
    #[serde(default = "default_page_size")]
    page_size: u32,
    model_name: Option<String>,
    source_tag: Option<String>,
    status: Option<String>,
    start_date: Option<String>,
    end_date: Option<String>,
}

fn default_page() -> u32 { 1 }
fn default_page_size() -> u32 { 20 }

#[derive(Debug, Serialize, sqlx::FromRow)]
struct LogRow {
    id: String,
    model_name: String,
    provider: String,
    source_tag: String,
    start_time: String,
    end_time: String,
    duration_ms: i64,
    ttft_ms: Option<i64>,
    total_tokens: i64,
    prompt_tokens: i64,
    completion_tokens: i64,
    cached_tokens: i64,
    cache_hit: i32,
    spend: f64,
    status: String,
    error_msg: Option<String>,
    tokens_per_second: f64,
}

/// GET /api/logs — 请求日志列表（分页+筛选）
async fn list_logs(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Query(params): Query<LogQueryParams>,
) -> impl IntoResponse {
    if let Err(resp) = crate::auth::middleware::check_auth(&state, &headers) {
        return resp;
    }
    let page = params.page.max(1);
    let page_size = params.page_size.min(100).max(1);
    let offset = ((page - 1) * page_size) as i64;

    // 动态构建 WHERE 条件
    let mut conditions = vec!["1=1".to_string()];

    if let Some(ref m) = params.model_name {
        conditions.push(format!("model_name = '{}'", m.replace('\'', "''")));
    }
    if let Some(ref s) = params.source_tag {
        conditions.push(format!("source_tag = '{}'", s.replace('\'', "''")));
    }
    if let Some(ref s) = params.status {
        conditions.push(format!("status = '{}'", s.replace('\'', "''")));
    }
    if let Some(ref d) = params.start_date {
        conditions.push(format!("created_at >= '{}'", d.replace('\'', "''")));
    }
    if let Some(ref d) = params.end_date {
        conditions.push(format!("created_at <= '{}'", d.replace('\'', "''")));
    }

    let where_clause = conditions.join(" AND ");

    // 总数
    let count_sql = format!("SELECT COUNT(*) as cnt FROM request_logs WHERE {}", where_clause);
    let count: (i64,) = sqlx::query_as(&count_sql)
        .fetch_one(&state.db)
        .await
        .unwrap_or((0,));

    // 分页数据
    let query_sql = format!(
        "SELECT id, model_name, provider, source_tag, start_time, end_time, duration_ms, \
         CASE WHEN completion_start_time IS NOT NULL AND completion_start_time != '' \
           THEN (EXTRACT(EPOCH FROM (completion_start_time::timestamptz - start_time::timestamptz)) * 1000)::BIGINT \
           ELSE NULL END as ttft_ms, \
         total_tokens, prompt_tokens, completion_tokens, cached_tokens, cache_hit, spend, status, error_msg, tokens_per_second \
         FROM request_logs WHERE {} ORDER BY created_at DESC LIMIT {} OFFSET {}",
        where_clause, page_size, offset
    );

    let logs: Vec<LogRow> = sqlx::query_as(&query_sql)
        .fetch_all(&state.db)
        .await
        .unwrap_or_default();

    let total_pages = ((count.0 as f64) / (page_size as f64)).ceil() as u32;

    Json(serde_json::json!({
        "logs": logs,
        "pagination": {
            "page": page,
            "size": page_size,
            "total": count.0,
            "total_pages": total_pages
        }
    }))
    .into_response()
}

#[derive(Debug, Serialize, sqlx::FromRow)]
struct LogDetailRow {
    id: String,
    model_name: String,
    provider: String,
    api_base: String,
    source_tag: String,
    start_time: String,
    end_time: String,
    completion_start_time: Option<String>,
    duration_ms: i64,
    ttft_ms: Option<i64>,
    total_tokens: i64,
    prompt_tokens: i64,
    completion_tokens: i64,
    cached_tokens: i64,
    cache_hit: i32,
    cache_key: Option<String>,
    spend: f64,
    status: String,
    messages: Option<String>,
    response: Option<String>,
    error_msg: Option<String>,
    created_at: chrono::DateTime<chrono::Utc>,
    tokens_per_second: f64,
}

async fn get_log_detail(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Path(id): Path<String>,
) -> impl IntoResponse {
    if let Err(resp) = crate::auth::middleware::check_auth(&state, &headers) {
        return resp;
    }
    let log = sqlx::query_as::<_, LogDetailRow>(
        "SELECT *, CASE WHEN completion_start_time IS NOT NULL AND completion_start_time != '' \
           THEN (EXTRACT(EPOCH FROM (completion_start_time::timestamptz - start_time::timestamptz)) * 1000)::BIGINT \
           ELSE NULL END as ttft_ms FROM request_logs WHERE id = $1"
    )
    .bind(&id)
    .fetch_optional(&state.db)
    .await;

    match log {
        Ok(Some(row)) => {
            // 解析 messages（TEXT → JSON）
            let messages: Option<serde_json::Value> = row.messages.as_ref().and_then(|s| serde_json::from_str(s).ok());
            // 兼容旧数据：messages 可能是完整请求体对象 {messages:[...], model:...}
            let messages = match &messages {
                Some(serde_json::Value::Object(obj)) if obj.contains_key("messages") => {
                    obj.get("messages").cloned()
                }
                other => other.clone(),
            };
            // 解析 response（TEXT → JSON）
            let response: Option<serde_json::Value> = row.response.as_ref().and_then(|s| serde_json::from_str(s).ok());
            // 从响应中提取思考过程和最终回复
            let (thinking_text, reply_text) = response.as_ref().map(|r| extract_thinking_and_reply(r)).unwrap_or_default();
            // response_text = 思考 + 回复（向后兼容）
            let response_text = if thinking_text.is_empty() { reply_text.clone() } else if reply_text.is_empty() { thinking_text.clone() } else { format!("{}\n\n---\n\n{}", thinking_text, reply_text) };
            Json(serde_json::json!({
                "id": row.id,
                "model_name": row.model_name,
                "provider": row.provider,
                "api_base": row.api_base,
                "source_tag": row.source_tag,
                "start_time": row.start_time,
                "end_time": row.end_time,
                "completion_start_time": row.completion_start_time,
                "duration_ms": row.duration_ms,
                "ttft_ms": row.ttft_ms,
                "total_tokens": row.total_tokens,
                "prompt_tokens": row.prompt_tokens,
                "completion_tokens": row.completion_tokens,
                "cached_tokens": row.cached_tokens,
                "cache_hit": row.cache_hit,
                "cache_key": row.cache_key,
                "spend": row.spend,
                "status": row.status,
                "messages": messages,
                "response": response,
                "response_text": response_text,
                "thinking_text": thinking_text,
                "reply_text": reply_text,
                "error_msg": row.error_msg,
                "created_at": row.created_at.to_rfc3339(),
                "tokens_per_second": row.tokens_per_second,
            })).into_response()
        }
        Ok(None) => (
            StatusCode::NOT_FOUND,
            Json(serde_json::json!({"error": "日志不存在"})),
        ).into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({"error": e.to_string()})),
        ).into_response(),
    }
}

// ── 统计 ──

#[derive(Debug, Deserialize)]
struct StatsQueryParams {
    #[serde(default = "default_days")]
    days: u32,
    from: Option<String>,
    to: Option<String>,
}

fn default_days() -> u32 { 30 }

#[derive(Debug, Serialize, sqlx::FromRow)]
struct StatsRow {
    date: String,
    model_name: String,
    source_tag: String,
    total_requests: i64,
    total_tokens: i64,
    prompt_tokens: i64,
    completion_tokens: i64,
    cache_hits: i64,
    total_spend: f64,
}

/// GET /api/stats/overview — 仪表盘总览
///
/// 返回：今日统计、总计统计、按模型分组、按来源分组、每日趋势
///
/// 性能优化：
/// - 全部使用 daily_stats 聚合表，不再扫描 request_logs（2.3GB）
/// - 聚合查询走 PRIMARY KEY(date, model_name, source_tag)
async fn get_stats_overview(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
) -> impl IntoResponse {
    if let Err(resp) = crate::auth::middleware::check_auth(&state, &headers) {
        return resp;
    }
    let db = &state.db;
    let today = chrono::Utc::now().format("%Y-%m-%d").to_string();
    let today_end = (chrono::Utc::now() + chrono::Duration::days(1)).format("%Y-%m-%d").to_string();
    let t0 = std::time::Instant::now();

    // ── 以下全部从 daily_stats 聚合表获取，不再查询 request_logs ──

    // 今日统计（从 daily_stats 筛选今日日期）
    let today_stats: (i64, i64, i64, i64, i64, f64, i64) = sqlx::query_as(
        "SELECT COALESCE(SUM(total_requests),0)::bigint, COALESCE(SUM(total_tokens),0)::bigint, \
                COALESCE(SUM(prompt_tokens),0)::bigint, COALESCE(SUM(completion_tokens),0)::bigint, \
                COALESCE(SUM(cached_tokens),0)::bigint, COALESCE(SUM(total_spend),0)::float8, \
                COALESCE(SUM(failed_requests),0)::bigint \
         FROM daily_stats WHERE date >= $1 AND date < $2"
    )
    .bind(&today)
    .bind(&today_end)
    .fetch_one(db)
    .await
    .map_err(|e| tracing::error!("today_stats query error: {}", e))
    .unwrap_or((0, 0, 0, 0, 0, 0.0, 0));

    // 总计统计（从 daily_stats 汇总）
    let total_stats: (i64, i64, i64, i64, i64, f64, i64) = sqlx::query_as(
        "SELECT COALESCE(SUM(total_requests),0)::bigint, COALESCE(SUM(total_tokens),0)::bigint, \
                COALESCE(SUM(prompt_tokens),0)::bigint, COALESCE(SUM(completion_tokens),0)::bigint, \
                COALESCE(SUM(cached_tokens),0)::bigint, COALESCE(SUM(total_spend),0)::float8, \
                COALESCE(SUM(failed_requests),0)::bigint \
         FROM daily_stats"
    )
    .fetch_one(db)
    .await
    .map_err(|e| tracing::error!("total_stats query error: {}", e))
    .unwrap_or((0, 0, 0, 0, 0, 0.0, 0));

    // 按模型分组（Top 10）
    #[derive(sqlx::FromRow)]
    struct ModelGroup { model_name: String, requests: i64, tokens: i64, spend: f64 }
    let by_model: Vec<ModelGroup> = sqlx::query_as(
        "SELECT model_name, SUM(total_requests)::bigint as requests, SUM(total_tokens)::bigint as tokens, \
                SUM(total_spend) as spend \
         FROM daily_stats GROUP BY model_name ORDER BY tokens DESC LIMIT 10"
    )
    .fetch_all(db)
    .await
    .map_err(|e| tracing::error!("by_model query error: {}", e))
    .unwrap_or_default();

    // 按来源分组（含 tokens 和 spend）
    #[derive(sqlx::FromRow)]
    struct SourceGroup { source_tag: String, requests: i64, tokens: i64, spend: f64, cached_tokens: i64 }
    let by_source: Vec<SourceGroup> = sqlx::query_as(
        "SELECT source_tag, SUM(total_requests)::bigint as requests, SUM(total_tokens)::bigint as tokens, \
                SUM(total_spend) as spend, SUM(cached_tokens)::bigint as cached_tokens \
         FROM daily_stats GROUP BY source_tag ORDER BY requests DESC"
    )
    .fetch_all(db)
    .await
    .unwrap_or_default();

    // 每日趋势（最近 30 天，按日期正序）
    #[derive(sqlx::FromRow, Serialize)]
    struct DailyTrend {
        date: String,
        requests: i64,
        tokens: i64,
        spend: f64,
    }
    let daily_trend: Vec<DailyTrend> = sqlx::query_as(
        "SELECT date, SUM(total_requests)::bigint as requests, SUM(total_tokens)::bigint as tokens, \
                SUM(total_spend) as spend \
         FROM daily_stats GROUP BY date ORDER BY date ASC LIMIT 30"
    )
    .fetch_all(db)
    .await
    .unwrap_or_default();

    // 每日趋势 — 按模型分组（堆叠柱状图用）
    #[derive(sqlx::FromRow, Serialize)]
    struct DailyByModel {
        date: String,
        model_name: String,
        requests: i64,
        tokens: i64,
        spend: f64,
        cached_tokens: i64,
    }
    let daily_by_model: Vec<DailyByModel> = sqlx::query_as(
        "SELECT date, model_name, SUM(total_requests)::bigint as requests, SUM(total_tokens)::bigint as tokens, \
                SUM(total_spend) as spend, SUM(cached_tokens)::bigint as cached_tokens \
         FROM daily_stats GROUP BY date, model_name ORDER BY date ASC"
    )
    .fetch_all(db)
    .await
    .unwrap_or_default();

    // 每日趋势 — 按来源分组（来源排行按时间过滤用）
    #[derive(sqlx::FromRow, Serialize)]
    struct DailyBySource {
        date: String,
        source_tag: String,
        requests: i64,
        tokens: i64,
        spend: f64,
        cached_tokens: i64,
    }
    let daily_by_source: Vec<DailyBySource> = sqlx::query_as(
        "SELECT date, source_tag, SUM(total_requests)::bigint as requests, SUM(total_tokens)::bigint as tokens, \
                SUM(total_spend) as spend, SUM(cached_tokens)::bigint as cached_tokens \
         FROM daily_stats GROUP BY date, source_tag ORDER BY date ASC"
    )
    .fetch_all(db)
    .await
    .unwrap_or_default();

    // 今日模型分布（从 daily_stats 聚合）
    #[derive(sqlx::FromRow)]
    struct TodayModel { model_name: String, cnt: i64, tokens: i64 }
    let today_models: Vec<TodayModel> = sqlx::query_as(
        "SELECT model_name, SUM(total_requests)::bigint as cnt, SUM(total_tokens)::bigint as tokens \
         FROM daily_stats WHERE date >= $1 AND date < $2 \
         GROUP BY model_name ORDER BY cnt DESC LIMIT 5"
    )
    .bind(&today)
    .bind(&today_end)
    .fetch_all(db)
    .await
    .unwrap_or_default();

    Json(serde_json::json!({
        "today": {
            "total_requests": today_stats.0,
            "failed_requests": today_stats.6,
            "total_tokens": today_stats.1,
            "prompt_tokens": today_stats.2,
            "completion_tokens": today_stats.3,
            "cached_tokens": today_stats.4,
            "total_spend": (today_stats.5 * 10000.0).round() / 10000.0,
            "currency": "CNY",
        },
        "total": {
            "total_requests": total_stats.0,
            "failed_requests": total_stats.6,
            "total_tokens": total_stats.1,
            "prompt_tokens": total_stats.2,
            "completion_tokens": total_stats.3,
            "cached_tokens": total_stats.4,
            "total_spend": (total_stats.5 * 10000.0).round() / 10000.0,
            "total_cache_hits": 0,
            "currency": "CNY",
        },
        "top_models": by_model.iter().map(|m| serde_json::json!({
            "model_name": m.model_name,
            "requests": m.requests,
            "tokens": m.tokens,
            "spend": m.spend,
        })).collect::<Vec<_>>(),
        "top_sources": by_source.iter().map(|s| serde_json::json!({
            "source_tag": s.source_tag,
            "requests": s.requests,
            "tokens": s.tokens,
            "cached_tokens": s.cached_tokens,
            "spend": (s.spend * 10000.0).round() / 10000.0,
        })).collect::<Vec<_>>(),
        "daily_trend": daily_trend,
        "daily_by_model": daily_by_model,
        "daily_by_source": daily_by_source,
        "today_models": today_models.iter().map(|m| serde_json::json!({
            "model_name": m.model_name,
            "requests": m.cnt,
            "tokens": m.tokens,
        })).collect::<Vec<_>>(),
    }))
    .into_response()
}

/// GET /api/stats/daily — 每日统计明细
///
/// 查询参数：from, to, model, source（全部可选）
async fn get_stats_daily(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Query(params): Query<StatsQueryParams>,
) -> impl IntoResponse {
    if let Err(resp) = crate::auth::middleware::check_auth(&state, &headers) {
        return resp;
    }
    let db = &state.db;

    // 支持 from/to 日期范围筛选，或 fallback 到 days 参数
    let daily: Vec<StatsRow> = if let (Some(ref from), Some(ref to)) = (&params.from, &params.to) {
        sqlx::query_as(
            "SELECT date, model_name, source_tag, total_requests, total_tokens, \
             prompt_tokens, completion_tokens, cache_hits, total_spend \
             FROM daily_stats WHERE date >= $1 AND date <= $2 ORDER BY date DESC"
        )
        .bind(from)
        .bind(to)
        .fetch_all(db)
        .await
        .unwrap_or_default()
    } else {
        let days = params.days.min(365);
        // 计算起始日期，按日期范围过滤而不是用 LIMIT（LIMIT 会限制行数而非天数）
        sqlx::query_as(
            "SELECT date, model_name, source_tag, total_requests, total_tokens, \
             prompt_tokens, completion_tokens, cache_hits, total_spend \
             FROM daily_stats WHERE date >= (CURRENT_DATE - ($1 || ' days')::interval)::text \
             ORDER BY date DESC"
        )
        .bind(days as i64)
        .fetch_all(db)
        .await
        .unwrap_or_default()
    };

    let total_requests: i64 = daily.iter().map(|r| r.total_requests).sum();
    let total_tokens: i64 = daily.iter().map(|r| r.total_tokens).sum();
    let total_spend: f64 = daily.iter().map(|r| r.total_spend).sum();
    let total_cache_hits: i64 = daily.iter().map(|r| r.cache_hits).sum();

    Json(serde_json::json!({
        "summary": {
            "total_requests": total_requests,
            "total_tokens": total_tokens,
            "total_spend": (total_spend * 10000.0).round() / 10000.0,
            "total_cache_hits": total_cache_hits,
            "currency": "CNY",
        },
        "daily": daily,
    }))
    .into_response()
}

// ── 来源标签 ──

#[derive(Debug, Serialize, sqlx::FromRow)]
struct SourceTagRow {
    source_tag: String,
    cnt: i64,
    #[serde(skip)]
    last_seen: Option<String>,
}

async fn get_source_tags(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
) -> impl IntoResponse {
    if let Err(resp) = crate::auth::middleware::check_auth(&state, &headers) {
        return resp;
    }
    let tags: Vec<SourceTagRow> = sqlx::query_as(
        "SELECT source_tag, COUNT(*) as cnt, MAX(created_at) as last_seen \
         FROM request_logs GROUP BY source_tag ORDER BY cnt DESC"
    )
    .fetch_all(&state.db)
    .await
    .unwrap_or_default();

    let result: Vec<serde_json::Value> = tags
        .into_iter()
        .map(|t| {
            serde_json::json!({
                "tag": t.source_tag,
                "requests": t.cnt,
                "last_seen": t.last_seen,
            })
        })
        .collect();

    Json(serde_json::json!({"tags": result})).into_response()
}

// ── 设置 ──

#[derive(Debug, Deserialize)]
struct UpdateSettingsRequest {
    log_retention_days: Option<i64>,
    master_key: Option<String>,
    old_master_key: Option<String>,
}

async fn get_settings(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
) -> impl IntoResponse {
    if let Err(resp) = crate::auth::middleware::check_auth(&state, &headers) {
        return resp;
    }
    Json(serde_json::json!({
        "log_retention_days": state.config.log_retention_days,
        "host": state.config.host,
        "port": state.config.port,
        "version": env!("CARGO_PKG_VERSION"),
        "has_master_key": state.auth.has_master_key(),
    }))
    .into_response()
}

async fn update_settings(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(req): Json<UpdateSettingsRequest>,
) -> impl IntoResponse {
    if let Err(resp) = crate::auth::middleware::check_auth(&state, &headers) {
        return resp;
    }

    // 更新日志保留天数
    if let Some(days) = req.log_retention_days {
        if days < 1 || days > 365 {
            return (StatusCode::BAD_REQUEST, Json(serde_json::json!({"error": "保留天数需在 1-365 之间"}))).into_response();
        }
        if let Err(e) = sqlx::query("INSERT INTO settings (key, value) VALUES ('log_retention_days', $1) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value")
            .bind(days.to_string())
            .execute(&state.db).await
        {
            return (StatusCode::INTERNAL_SERVER_ERROR, Json(serde_json::json!({"error": e.to_string()}))).into_response();
        }
        tracing::info!("日志保留天数已更新为 {}", days);
    }

    // 更新主密钥
    if let Some(new_key) = req.master_key {
        let old_key = req.old_master_key.unwrap_or_default();
        if !state.auth.has_master_key() || state.auth.verify_master_key(&old_key) {
            let new_hash = crate::crypto::sha256_hash(&new_key);
            if let Err(e) = sqlx::query("INSERT INTO settings (key, value) VALUES ('master_key_hash', $1) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value")
                .bind(&new_hash)
                .execute(&state.db).await
            {
                return (StatusCode::INTERNAL_SERVER_ERROR, Json(serde_json::json!({"error": e.to_string()}))).into_response();
            }
            tracing::info!("主密钥已更新");
        } else {
            return (StatusCode::UNAUTHORIZED, Json(serde_json::json!({"error": "旧主密钥错误"}))).into_response();
        }
    }

    Json(serde_json::json!({"success": true})).into_response()
}

// ── 认证 ──

#[derive(Debug, Deserialize)]
struct LoginRequest {
    master_key: String,
}

/// POST /api/auth/login — 验证主密钥
///
/// 未设置主密钥时总是返回成功（首次使用/开发模式）
/// 设置了主密钥时验证密码
async fn auth_login(
    State(state): State<Arc<AppState>>,
    Json(req): Json<LoginRequest>,
) -> impl IntoResponse {
    if !state.auth.has_master_key() {
        // 未设置主密钥，允许任何密码登录
        return Json(serde_json::json!({
            "success": true,
            "message": "登录成功（未设置主密钥，开发模式）"
        })).into_response();
    }

    if state.auth.verify_master_key(&req.master_key) {
        Json(serde_json::json!({
            "success": true,
            "message": "登录成功"
        })).into_response()
    } else {
        (StatusCode::UNAUTHORIZED, Json(serde_json::json!({
            "success": false,
            "message": "主密钥错误"
        }))).into_response()
    }
}

/// GET /api/auth/check — 检查认证状态
///
/// 前端每次加载页面时调用，判断是否需要跳转登录页
async fn auth_check(
    headers: HeaderMap,
    State(state): State<Arc<AppState>>,
) -> impl IntoResponse {
    // 未设置主密钥 → 总是已认证
    if !state.auth.has_master_key() {
        return Json(serde_json::json!({"authenticated": true}));
    }

    // 检查 Authorization 头
    let authenticated = headers
        .get("Authorization")
        .and_then(|v| v.to_str().ok())
        .and_then(|v| v.strip_prefix("Bearer "))
        .map(|key| state.auth.verify_master_key(key))
        .unwrap_or(false);

    Json(serde_json::json!({"authenticated": authenticated}))
}

/// POST /api/auth/logout — 登出（无状态，前端清除本地 key 即可）
async fn auth_logout() -> impl IntoResponse {
    Json(serde_json::json!({"success": true}))
}

// ── 提供商管理 ──

/// GET /api/providers — 提供商列表
async fn list_providers(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
) -> impl IntoResponse {
    if let Err(resp) = crate::auth::middleware::check_auth(&state, &headers) {
        return resp;
    }
    match crate::models::list_providers(&state.db).await {
        Ok(rows) => {
            let providers: Vec<crate::models::ProviderConfig> = rows
                .into_iter()
                .map(|r| {
                    let decrypted = crate::models::decrypt_api_key(
                        &r.encrypted_api_key,
                        &state.config.encryption_key,
                    )
                    .unwrap_or_default();
                    r.into_config(decrypted)
                })
                .collect();
            Json(serde_json::json!({ "providers": providers })).into_response()
        }
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({"error": e.to_string()})),
        )
            .into_response(),
    }
}

/// POST /api/providers — 创建提供商
async fn create_provider(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(req): Json<crate::models::CreateProviderRequest>,
) -> impl IntoResponse {
    if let Err(resp) = crate::auth::middleware::check_auth(&state, &headers) {
        return resp;
    }
    match crate::models::create_provider(&state.db, req, &state.config.encryption_key).await {
        Ok(provider) => (StatusCode::CREATED, Json(provider)).into_response(),
        Err(e) => {
            let msg = e.to_string();
            let code = if msg.contains("UNIQUE constraint") {
                StatusCode::CONFLICT
            } else {
                StatusCode::INTERNAL_SERVER_ERROR
            };
            (code, Json(serde_json::json!({"error": msg}))).into_response()
        }
    }
}

/// GET /api/providers/:id — 提供商详情
async fn get_provider(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Path(id): Path<String>,
) -> impl IntoResponse {
    if let Err(resp) = crate::auth::middleware::check_auth(&state, &headers) {
        return resp;
    }
    match crate::models::get_provider(&state.db, &id).await {
        Ok(Some(row)) => {
            let decrypted = crate::models::decrypt_api_key(
                &row.encrypted_api_key,
                &state.config.encryption_key,
            )
            .unwrap_or_default();
            Json(row.into_config(decrypted)).into_response()
        }
        Ok(None) => (
            StatusCode::NOT_FOUND,
            Json(serde_json::json!({"error": "提供商不存在"})),
        )
            .into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({"error": e.to_string()})),
        )
            .into_response(),
    }
}

/// PUT /api/providers/:id — 更新提供商
async fn update_provider(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Path(id): Path<String>,
    Json(req): Json<crate::models::UpdateProviderRequest>,
) -> impl IntoResponse {
    if let Err(resp) = crate::auth::middleware::check_auth(&state, &headers) {
        return resp;
    }
    match crate::models::update_provider(&state.db, &id, req, &state.config.encryption_key).await {
        Ok(Some(provider)) => Json(provider).into_response(),
        Ok(None) => (
            StatusCode::NOT_FOUND,
            Json(serde_json::json!({"error": "提供商不存在"})),
        )
            .into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({"error": e.to_string()})),
        )
            .into_response(),
    }
}

/// DELETE /api/providers/:id — 删除提供商
async fn delete_provider(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Path(id): Path<String>,
) -> impl IntoResponse {
    if let Err(resp) = crate::auth::middleware::check_auth(&state, &headers) {
        return resp;
    }
    match crate::models::delete_provider(&state.db, &id).await {
        Ok(true) => Json(serde_json::json!({"success": true})).into_response(),
        Ok(false) => (
            StatusCode::NOT_FOUND,
            Json(serde_json::json!({"error": "提供商不存在"})),
        )
            .into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({"error": e.to_string()})),
        )
            .into_response(),
    }
}

/// GET /api/providers/:id/models — 代理获取提供商的 /v1/models
async fn get_provider_models(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Path(id): Path<String>,
) -> impl IntoResponse {
    if let Err(resp) = crate::auth::middleware::check_auth(&state, &headers) {
        return resp;
    }

    // 查找提供商
    let provider = match crate::models::get_provider(&state.db, &id).await {
        Ok(Some(p)) => p,
        Ok(None) => {
            return (
                StatusCode::NOT_FOUND,
                Json(serde_json::json!({"error": "提供商不存在"})),
            )
                .into_response();
        }
        Err(e) => {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(serde_json::json!({"error": e.to_string()})),
            )
                .into_response();
        }
    };

    // 解密 API Key
    let api_key = match crate::models::decrypt_api_key(
        &provider.encrypted_api_key,
        &state.config.encryption_key,
    ) {
        Ok(k) => k,
        Err(e) => {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(serde_json::json!({"error": format!("解密 API Key 失败: {}", e)})),
            )
                .into_response();
        }
    };

    // 构建请求 URL：智能拼接，避免 /v1/v1/models 问题
    let api_base = provider.api_base.trim_end_matches('/');
    let url = if api_base.ends_with("/v1") {
        format!("{}/models", api_base)
    } else {
        format!("{}/v1/models", api_base)
    };

    // 发送 HTTP 请求到提供商
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(15))
        .build()
        .map_err(|e| {
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(serde_json::json!({"error": format!("创建 HTTP 客户端失败: {}", e)})),
            )
        });

    let client = match client {
        Ok(c) => c,
        Err(resp) => return resp.into_response(),
    };

    match client
        .get(&url)
        .header("Authorization", format!("Bearer {}", api_key))
        .send()
        .await
    {
        Ok(resp) => {
            let status = resp.status();
            let body = resp.text().await.unwrap_or_default();

            if status.is_success() {
                // 尝试解析为 JSON 并提取模型列表
                if let Ok(json) = serde_json::from_str::<serde_json::Value>(&body) {
                    // OpenAI 格式: {"data": [{"id": "gpt-4", ...}, ...]}
                    let models = json["data"]
                        .as_array()
                        .map(|arr| {
                            arr.iter()
                                .filter_map(|m| m["id"].as_str().map(|s| s.to_string()))
                                .collect::<Vec<_>>()
                        })
                        .unwrap_or_default();
                    Json(serde_json::json!({ "models": models })).into_response()
                } else {
                    Json(serde_json::json!({
                        "models": [],
                        "error": format!("无法解析提供商返回的模型列表: {}", &body[..body.len().min(200)])
                    }))
                    .into_response()
                }
            } else {
                (
                    StatusCode::BAD_GATEWAY,
                    Json(serde_json::json!({
                        "error": format!("提供商返回错误 (HTTP {}): {}", status.as_u16(),
                            &body[..body.len().min(500)])
                    })),
                )
                    .into_response()
            }
        }
        Err(e) => (
            StatusCode::BAD_GATEWAY,
            Json(serde_json::json!({"error": format!("请求提供商失败: {}", e)})),
        )
            .into_response(),
    }
}
