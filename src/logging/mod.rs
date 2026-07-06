//! 日志模块
//!
//! 负责请求日志写入和定期清理

use chrono::Utc;
use sqlx::PgPool;

/// 请求日志记录
#[derive(Debug)]
pub struct RequestLogEntry {
    pub id: String,
    pub model_name: String,
    pub provider: String,
    pub api_base: String,
    pub source_tag: String,
    pub start_time: String,
    pub end_time: String,
    pub completion_start_time: Option<String>,
    pub duration_ms: i64,
    pub total_tokens: i64,
    pub prompt_tokens: i64,
    pub completion_tokens: i64,
    pub cache_hit: bool,
    pub cache_key: Option<String>,
    pub cached_tokens: i64,
    pub spend: f64,
    pub status: String,
    pub messages: Option<String>,
    pub response: Option<String>,
    pub error_msg: Option<String>,
    pub tokens_per_second: f64,
}

/// 写入请求日志
pub async fn write_request_log(db: &PgPool, entry: &RequestLogEntry) -> anyhow::Result<()> {
    sqlx::query(
        r#"
        INSERT INTO request_logs (
            id, model_name, provider, api_base, source_tag,
            start_time, end_time, completion_start_time, duration_ms,
            total_tokens, prompt_tokens, completion_tokens,
            cache_hit, cache_key, cached_tokens, spend, status,
            messages, response, error_msg, tokens_per_second, created_at
        ) VALUES (
            $1, $2, $3, $4, $5,
            $6, $7, $8, $9,
            $10, $11, $12,
            $13, $14, $15, $16, $17,
            $18, $19, $20, $21, NOW()
        )
        "#,
    )
    .bind(&entry.id)
    .bind(&entry.model_name)
    .bind(&entry.provider)
    .bind(&entry.api_base)
    .bind(&entry.source_tag)
    .bind(&entry.start_time)
    .bind(&entry.end_time)
    .bind(&entry.completion_start_time)
    .bind(entry.duration_ms)
    .bind(entry.total_tokens)
    .bind(entry.prompt_tokens)
    .bind(entry.completion_tokens)
    .bind(entry.cache_hit as i32)
    .bind(&entry.cache_key)
    .bind(entry.cached_tokens)
    .bind(entry.spend)
    .bind(&entry.status)
    .bind(&entry.messages)
    .bind(&entry.response)
    .bind(&entry.error_msg)
    .bind(entry.tokens_per_second)
    .execute(db)
    .await?;

    Ok(())
}

/// 更新每日统计（upsert）
pub async fn update_daily_stats(
    db: &PgPool,
    model_name: &str,
    source_tag: &str,
    total_tokens: i64,
    prompt_tokens: i64,
    completion_tokens: i64,
    cache_hit: bool,
    cached_tokens: i64,
    spend: f64,
    is_error: bool,
) -> anyhow::Result<()> {
    let today = Utc::now().format("%Y-%m-%d").to_string();
    let cache_hit_int = if cache_hit { 1 } else { 0 };
    let failed_int = if is_error { 1 } else { 0 };

    sqlx::query(
        r#"
        INSERT INTO daily_stats (date, model_name, source_tag, total_requests,
                                 total_tokens, prompt_tokens, completion_tokens,
                                 cache_hits, cached_tokens, total_spend, failed_requests)
        VALUES ($1, $2, $3, 1, $4, $5, $6, $7, $8, $9, $10)
        ON CONFLICT(date, model_name, source_tag) DO UPDATE SET
            total_requests = daily_stats.total_requests + 1,
            total_tokens = daily_stats.total_tokens + EXCLUDED.total_tokens,
            prompt_tokens = daily_stats.prompt_tokens + EXCLUDED.prompt_tokens,
            completion_tokens = daily_stats.completion_tokens + EXCLUDED.completion_tokens,
            cache_hits = daily_stats.cache_hits + EXCLUDED.cache_hits,
            cached_tokens = daily_stats.cached_tokens + EXCLUDED.cached_tokens,
            total_spend = daily_stats.total_spend + EXCLUDED.total_spend,
            failed_requests = daily_stats.failed_requests + EXCLUDED.failed_requests
        "#,
    )
    .bind(&today)
    .bind(model_name)
    .bind(source_tag)
    .bind(total_tokens)
    .bind(prompt_tokens)
    .bind(completion_tokens)
    .bind(cache_hit_int)
    .bind(cached_tokens)
    .bind(spend)
    .bind(failed_int)
    .execute(db)
    .await?;

    Ok(())
}

/// 启动日志清理任务
///
/// 每 6 小时清理一次超过保留天数的日志
pub fn start_cleanup_task(db: PgPool, retention_days: i64) {
    tokio::spawn(async move {
        // 启动时立即清理一次
        cleanup_expired_logs(&db, retention_days).await;

        let mut interval = tokio::time::interval(tokio::time::Duration::from_secs(6 * 3600));
        loop {
            interval.tick().await;
            cleanup_expired_logs(&db, retention_days).await;
        }
    });
}

/// 清理过期日志
async fn cleanup_expired_logs(db: &PgPool, retention_days: i64) {
    let result = sqlx::query(
        "DELETE FROM request_logs WHERE created_at < NOW() - ($1 || ' days')::interval",
    )
    .bind(retention_days)
    .execute(db)
    .await;

    match result {
        Ok(r) => {
            if r.rows_affected() > 0 {
                tracing::info!("清理了 {} 条过期日志", r.rows_affected());
            }
        }
        Err(e) => {
            tracing::error!("日志清理失败: {}", e);
        }
    }
}
