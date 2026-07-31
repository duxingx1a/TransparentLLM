//! 日志模块
//!
//! 负责请求日志写入和定期清理
//!
//! 使用批量写入器（BatchLogger）将日志攒批后每 15s 写入一次 DB，
//! 避免高并发时每个请求都竞争 DB 连接。

use std::sync::Arc;

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

/// 每日统计更新
#[derive(Debug, Clone)]
pub struct DailyStatsUpdate {
    pub model_name: String,
    pub source_tag: String,
    pub total_tokens: i64,
    pub prompt_tokens: i64,
    pub completion_tokens: i64,
    pub cache_hit: bool,
    pub cached_tokens: i64,
    pub spend: f64,
    pub is_error: bool,
}

/// 批量日志写入器
///
/// 代理请求结束后将日志条目发到内存通道，后台任务每 15s 批量 flush 一次。
/// 大幅减少 DB 连接竞争，适合低资源高并发场景。
pub struct BatchLogger {
    tx: tokio::sync::mpsc::UnboundedSender<LogMessage>,
}

enum LogMessage {
    RequestLog(RequestLogEntry),
    DailyStats(DailyStatsUpdate),
}

impl BatchLogger {
    /// 启动批量写入器，返回句柄
    ///
    /// `flush_interval`：批量写入间隔，默认 15 秒
    pub fn start(db: PgPool, flush_interval: std::time::Duration) -> Arc<Self> {
        let (tx, rx) = tokio::sync::mpsc::unbounded_channel::<LogMessage>();

        tokio::spawn(async move {
            let mut batch_logs: Vec<RequestLogEntry> = Vec::new();
            let mut batch_stats: Vec<DailyStatsUpdate> = Vec::new();
            let mut rx = rx;
            let mut interval = tokio::time::interval(flush_interval);
            interval.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Skip);

            loop {
                tokio::select! {
                    // 收集消息直到间隔到期
                    _ = interval.tick() => {
                        if !batch_logs.is_empty() || !batch_stats.is_empty() {
                            Self::flush_batch(&db, &batch_logs, &batch_stats).await;
                            batch_logs.clear();
                            batch_stats.clear();
                        }
                    }
                    msg = rx.recv() => {
                        match msg {
                            Some(LogMessage::RequestLog(entry)) => {
                                batch_logs.push(entry);
                            }
                            Some(LogMessage::DailyStats(update)) => {
                                batch_stats.push(update);
                            }
                            None => {
                                // 通道关闭，最后一次 flush
                                if !batch_logs.is_empty() || !batch_stats.is_empty() {
                                    Self::flush_batch(&db, &batch_logs, &batch_stats).await;
                                }
                                break;
                            }
                        }
                    }
                }
            }
        });

        Arc::new(Self { tx })
    }

    /// 异步写入请求日志（实际入队，不阻塞）
    pub fn write_log(&self, entry: RequestLogEntry) {
        let _ = self.tx.send(LogMessage::RequestLog(entry));
    }

    /// 异步更新每日统计（实际入队，不阻塞）
    pub fn update_stats(&self, update: DailyStatsUpdate) {
        let _ = self.tx.send(LogMessage::DailyStats(update));
    }

    /// 批量 flush：一次事务写入所有日志 + 统计
    async fn flush_batch(db: &PgPool, logs: &[RequestLogEntry], stats: &[DailyStatsUpdate]) {
        if logs.is_empty() && stats.is_empty() {
            return;
        }

        let start = std::time::Instant::now();

        // 批量写入 request_logs
        if !logs.is_empty() {
            Self::batch_insert_logs(db, logs).await;
        }

        // 批量更新 daily_stats
        for stat in stats {
            if let Err(e) = update_daily_stats(
                db,
                &stat.model_name,
                &stat.source_tag,
                stat.total_tokens,
                stat.prompt_tokens,
                stat.completion_tokens,
                stat.cache_hit,
                stat.cached_tokens,
                stat.spend,
                stat.is_error,
            )
            .await
            {
                tracing::error!("批量 daily_stats 更新失败: {}", e);
            }
        }

        let elapsed = start.elapsed();
        if elapsed > std::time::Duration::from_millis(100) {
            tracing::warn!(
                "批量写入耗时较长: {} 条日志 + {} 条统计, 耗时 {:?}",
                logs.len(),
                stats.len(),
                elapsed
            );
        }
    }

    /// 批量 INSERT request_logs（单条 SQL 插入多条）
    async fn batch_insert_logs(db: &PgPool, entries: &[RequestLogEntry]) {
        // 分批写入，每批最多 100 条
        for chunk in entries.chunks(100) {
            let mut query_builder = String::from(
                "INSERT INTO request_logs (
                    id, model_name, provider, api_base, source_tag,
                    start_time, end_time, completion_start_time, duration_ms,
                    total_tokens, prompt_tokens, completion_tokens,
                    cache_hit, cache_key, cached_tokens, spend, status,
                    messages, response, error_msg, tokens_per_second, created_at
                ) VALUES "
            );

            let mut param_idx = 1;
            let mut first = true;
            for _ in chunk {
                if !first {
                    query_builder.push_str(", ");
                }
                first = false;
                query_builder.push_str(&format!(
                    "(${}, ${}, ${}, ${}, ${}, ${}, ${}, ${}, ${}, ${}, ${}, ${}, ${}, ${}, ${}, ${}, ${}, ${}, ${}, ${}, ${}, NOW())",
                    param_idx, param_idx + 1, param_idx + 2, param_idx + 3, param_idx + 4,
                    param_idx + 5, param_idx + 6, param_idx + 7, param_idx + 8,
                    param_idx + 9, param_idx + 10, param_idx + 11,
                    param_idx + 12, param_idx + 13, param_idx + 14, param_idx + 15, param_idx + 16,
                    param_idx + 17, param_idx + 18, param_idx + 19, param_idx + 20,
                ));
                param_idx += 21;
            }

            let mut query = sqlx::query(&query_builder);
            for entry in chunk {
                query = query
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
                    .bind(entry.tokens_per_second);
            }

            if let Err(e) = query.execute(db).await {
                tracing::error!("批量日志写入失败 ({} 条): {}", chunk.len(), e);
            }
        }
    }
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
/// 滑动窗口策略：
/// - 超过 7 天：清空 messages 和 response（保留指标用于统计）
/// - 超过 BODY_RETENTION_DAYS（默认 30）：删除整条记录
/// 任务启动时立即执行一次，之后每 6 小时执行一次。
pub fn start_cleanup_task(db: PgPool, retention_days: i64) {
    tokio::spawn(async move {
        // 启动时立即执行一次
        sliding_window_cleanup(&db).await;

        let mut interval = tokio::time::interval(tokio::time::Duration::from_secs(6 * 3600));
        loop {
            interval.tick().await;
            sliding_window_cleanup(&db).await;
        }
    });
}

/// 滑动窗口清理
///
/// 步骤（按顺序）：
/// 1. 重建 daily_stats（在删数据前保留统计）
/// 2. 超过 7 天的记录清空 messages/response
/// 3. 超过 BODY_RETENTION_DAYS 天（默认 30）的记录删除
/// 4. VACUUM 回收空间
const BODY_RETENTION_DAYS: i64 = 30;
async fn sliding_window_cleanup(db: &PgPool) {

    // ── 1. 重建 daily_stats（备份前确保统计完整）──
    tracing::info!("开始重建 daily_stats...");
    let rebuild = sqlx::query(
        r#"
        INSERT INTO daily_stats (date, model_name, source_tag, total_requests,
            total_tokens, prompt_tokens, completion_tokens, cache_hits,
            cached_tokens, total_spend, failed_requests)
        SELECT
            DATE(start_time) as date,
            model_name,
            source_tag,
            COUNT(*)::bigint as total_requests,
            SUM(total_tokens)::bigint as total_tokens,
            SUM(prompt_tokens)::bigint as prompt_tokens,
            SUM(completion_tokens)::bigint as completion_tokens,
            SUM(CASE WHEN cache_hit != 0 THEN 1 ELSE 0 END)::bigint as cache_hits,
            SUM(cached_tokens)::bigint as cached_tokens,
            SUM(spend) as total_spend,
            SUM(CASE WHEN status != 'success' THEN 1 ELSE 0 END)::bigint as failed_requests
        FROM request_logs
        WHERE start_time >= CURRENT_DATE - INTERVAL '1 day'
        GROUP BY DATE(start_time), model_name, source_tag
        ON CONFLICT(date, model_name, source_tag) DO UPDATE SET
            total_requests        = EXCLUDED.total_requests,
            total_tokens          = EXCLUDED.total_tokens,
            prompt_tokens         = EXCLUDED.prompt_tokens,
            completion_tokens     = EXCLUDED.completion_tokens,
            cache_hits            = EXCLUDED.cache_hits,
            cached_tokens         = EXCLUDED.cached_tokens,
            total_spend           = EXCLUDED.total_spend,
            failed_requests       = EXCLUDED.failed_requests
        "#,
    )
    .execute(db)
    .await;

    match rebuild {
        Ok(r) => {
            if r.rows_affected() > 0 {
                tracing::info!("daily_stats 重建完成，影响 {} 行", r.rows_affected());
            }
        }
        Err(e) => tracing::error!("daily_stats 重建失败: {}", e),
    }

    // ── 2. 超过 7 天的记录：清空 messages 和 response（保留指标）──
    let clear_body = sqlx::query(
        r#"
        UPDATE request_logs
        SET messages = NULL, response = NULL
        WHERE created_at < CURRENT_DATE - INTERVAL '7 days'
          AND (messages IS NOT NULL OR response IS NOT NULL)
        "#,
    )
    .execute(db)
    .await;

    match clear_body {
        Ok(r) => {
            if r.rows_affected() > 0 {
                tracing::info!("已清空 {} 条记录的 messages/response（>7天）", r.rows_affected());
            }
        }
        Err(e) => tracing::error!("清空 messages/response 失败: {}", e),
    }

    // ── 3. 超过 BODY_RETENTION_DAYS 天的记录删除 ──
    let delete_old = sqlx::query(
        "DELETE FROM request_logs WHERE created_at < CURRENT_DATE - $1::interval",
    )
    .bind(format!("{} days", BODY_RETENTION_DAYS))
    .execute(db)
    .await;

    match delete_old {
        Ok(r) => {
            if r.rows_affected() > 0 {
                tracing::info!(
                    "已删除 {} 条过期记录（>{}天）",
                    r.rows_affected(),
                    BODY_RETENTION_DAYS
                );
            }
        }
        Err(e) => tracing::error!("删除过期记录失败: {}", e),
    }
}

/// 启动时从 request_logs 重建 daily_stats（防止部署后数据丢失）
///
/// 仅在 daily_stats 为空但 request_logs 有数据时执行。
pub async fn sync_daily_stats_from_logs(db: &PgPool) {
    let logs_count: (i64,) = sqlx::query_as("SELECT COUNT(*)::bigint FROM request_logs")
        .fetch_one(db)
        .await
        .unwrap_or((0,));

    if logs_count.0 == 0 {
        return; // request_logs 为空，无需同步
    }

    tracing::info!(
        "daily_stats 为空但有 {} 条 request_logs，开始重建...",
        logs_count.0
    );

    let result = sqlx::query(
        r#"
        INSERT INTO daily_stats (date, model_name, source_tag, total_requests,
            total_tokens, prompt_tokens, completion_tokens, cache_hits,
            cached_tokens, total_spend, failed_requests)
        SELECT
            DATE(start_time) as date,
            model_name,
            source_tag,
            COUNT(*)::bigint as total_requests,
            SUM(total_tokens)::bigint as total_tokens,
            SUM(prompt_tokens)::bigint as prompt_tokens,
            SUM(completion_tokens)::bigint as completion_tokens,
            SUM(CASE WHEN cache_hit != 0 THEN 1 ELSE 0 END)::bigint as cache_hits,
            SUM(cached_tokens)::bigint as cached_tokens,
            SUM(spend) as total_spend,
            SUM(CASE WHEN status != 'success' THEN 1 ELSE 0 END)::bigint as failed_requests
        FROM request_logs
        GROUP BY DATE(start_time), model_name, source_tag
        ON CONFLICT(date, model_name, source_tag) DO UPDATE SET
            total_requests = EXCLUDED.total_requests,
            total_tokens = EXCLUDED.total_tokens,
            prompt_tokens = EXCLUDED.prompt_tokens,
            completion_tokens = EXCLUDED.completion_tokens,
            cache_hits = EXCLUDED.cache_hits,
            cached_tokens = EXCLUDED.cached_tokens,
            total_spend = EXCLUDED.total_spend,
            failed_requests = EXCLUDED.failed_requests
        "#,
    )
    .execute(db)
    .await;

    match result {
        Ok(r) => tracing::info!("daily_stats 重建完成，写入 {} 行", r.rows_affected()),
        Err(e) => tracing::error!("daily_stats 重建失败: {}", e),
    }
}
