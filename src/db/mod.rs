//! 数据库模块
//!
//! 负责 PostgreSQL 数据库迁移和连接管理
//! 从 SQLite 迁移：利用 PG 的 TOAST 压缩自动缩小 messages/response 存储

use sqlx::PgPool;

/// 执行数据库迁移（全部使用 IF NOT EXISTS，幂等安全）
pub async fn run_migrations(db: &PgPool) -> anyhow::Result<()> {
    // ── 模型配置表 ──
    sqlx::query(
        r#"
        CREATE TABLE IF NOT EXISTS models (
            id                  TEXT PRIMARY KEY,
            model_name          TEXT NOT NULL,
            provider            TEXT NOT NULL,
            api_base            TEXT NOT NULL,
            encrypted_api_key   BYTEA NOT NULL,
            input_price         DOUBLE PRECISION NOT NULL DEFAULT 0,
            output_price        DOUBLE PRECISION NOT NULL DEFAULT 0,
            cache_price         DOUBLE PRECISION NOT NULL DEFAULT 0,
            model_type          TEXT NOT NULL DEFAULT 'chat',
            upstream_model_name TEXT NOT NULL DEFAULT '',
            created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
        "#,
    )
    .execute(db)
    .await?;

    // ── 请求日志表 ──
    // messages/response 使用 TEXT，PostgreSQL TOAST 自动压缩（通常 80-97%）
    sqlx::query(
        r#"
        CREATE TABLE IF NOT EXISTS request_logs (
            id                      TEXT PRIMARY KEY,
            model_name              TEXT NOT NULL,
            provider                TEXT NOT NULL,
            api_base                TEXT NOT NULL,
            source_tag              TEXT NOT NULL DEFAULT 'unknown',
            start_time              TEXT NOT NULL,
            end_time                TEXT NOT NULL,
            completion_start_time   TEXT,
            duration_ms             BIGINT NOT NULL,
            total_tokens            BIGINT NOT NULL DEFAULT 0,
            prompt_tokens           BIGINT NOT NULL DEFAULT 0,
            completion_tokens       BIGINT NOT NULL DEFAULT 0,
            cache_hit               INTEGER NOT NULL DEFAULT 0,
            cache_key               TEXT,
            cached_tokens           BIGINT NOT NULL DEFAULT 0,
            spend                   DOUBLE PRECISION NOT NULL DEFAULT 0,
            status                  TEXT NOT NULL DEFAULT 'success',
            messages                TEXT,
            response                TEXT,
            error_msg               TEXT,
            tokens_per_second       DOUBLE PRECISION NOT NULL DEFAULT 0,
            created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
        "#,
    )
    .execute(db)
    .await?;

    // 索引
    sqlx::query("CREATE INDEX IF NOT EXISTS idx_rl_created_at ON request_logs(created_at)")
        .execute(db).await?;
    sqlx::query("CREATE INDEX IF NOT EXISTS idx_rl_model ON request_logs(model_name)")
        .execute(db).await?;
    sqlx::query("CREATE INDEX IF NOT EXISTS idx_rl_source ON request_logs(source_tag)")
        .execute(db).await?;
    sqlx::query("CREATE INDEX IF NOT EXISTS idx_rl_status ON request_logs(status)")
        .execute(db).await?;
    sqlx::query("CREATE INDEX IF NOT EXISTS idx_rl_created_status ON request_logs(created_at, status)")
        .execute(db).await?;

    // ── 每日统计表 ──
    sqlx::query(
        r#"
        CREATE TABLE IF NOT EXISTS daily_stats (
            date                TEXT NOT NULL,
            model_name          TEXT NOT NULL,
            source_tag          TEXT NOT NULL,
            total_requests      BIGINT NOT NULL DEFAULT 0,
            total_tokens        BIGINT NOT NULL DEFAULT 0,
            prompt_tokens       BIGINT NOT NULL DEFAULT 0,
            completion_tokens   BIGINT NOT NULL DEFAULT 0,
            cache_hits          BIGINT NOT NULL DEFAULT 0,
            cached_tokens       BIGINT NOT NULL DEFAULT 0,
            total_spend         DOUBLE PRECISION NOT NULL DEFAULT 0,
            failed_requests     BIGINT NOT NULL DEFAULT 0,
            PRIMARY KEY (date, model_name, source_tag)
        )
        "#,
    )
    .execute(db)
    .await?;

    sqlx::query("CREATE INDEX IF NOT EXISTS idx_ds_source ON daily_stats(source_tag)")
        .execute(db).await?;

    // ── 系统设置表 ──
    sqlx::query(
        r#"
        CREATE TABLE IF NOT EXISTS settings (
            key     TEXT PRIMARY KEY,
            value   TEXT NOT NULL
        )
        "#,
    )
    .execute(db)
    .await?;

    // ── 提供商管理表 ──
    sqlx::query(
        r#"
        CREATE TABLE IF NOT EXISTS providers (
            id                  TEXT PRIMARY KEY,
            name                TEXT NOT NULL UNIQUE,
            api_base            TEXT NOT NULL,
            encrypted_api_key   BYTEA NOT NULL,
            created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
        "#,
    )
    .execute(db)
    .await?;

    tracing::info!("PostgreSQL 迁移完成");
    Ok(())
}
