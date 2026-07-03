//! 数据库模块
//!
//! 负责 SQLite 数据库的 migrations 和连接管理

use sqlx::SqlitePool;

/// 执行数据库迁移
///
/// 创建所有必要的表（如果不存在）
pub async fn run_migrations(db: &SqlitePool) -> anyhow::Result<()> {
    // 模型配置表（v1.4: 去除 model_name UNIQUE，允许同名多提供商）
    sqlx::query(
        r#"
        CREATE TABLE IF NOT EXISTS models (
            id              TEXT PRIMARY KEY,
            model_name      TEXT NOT NULL,
            provider        TEXT NOT NULL,
            api_base        TEXT NOT NULL,
            encrypted_api_key BLOB NOT NULL,
            input_price     REAL NOT NULL DEFAULT 0,
            output_price    REAL NOT NULL DEFAULT 0,
            cache_price     REAL NOT NULL DEFAULT 0,
            model_type      TEXT NOT NULL DEFAULT 'chat',
            created_at      TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
        )
        "#,
    )
    .execute(db)
    .await?;

    // 请求日志表（30 天 TTL）
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
            duration_ms             INTEGER NOT NULL,
            total_tokens            INTEGER NOT NULL DEFAULT 0,
            prompt_tokens           INTEGER NOT NULL DEFAULT 0,
            completion_tokens       INTEGER NOT NULL DEFAULT 0,
            cache_hit               INTEGER NOT NULL DEFAULT 0,
            cache_key               TEXT,
            spend                   REAL NOT NULL DEFAULT 0,
            status                  TEXT NOT NULL DEFAULT 'success',
            messages                TEXT,
            response                TEXT,
            error_msg               TEXT,
            created_at              TEXT NOT NULL DEFAULT (datetime('now'))
        )
        "#,
    )
    .execute(db)
    .await?;

    // 日志索引
    sqlx::query(
        "CREATE INDEX IF NOT EXISTS idx_request_logs_created_at ON request_logs(created_at)",
    )
    .execute(db)
    .await?;

    sqlx::query(
        "CREATE INDEX IF NOT EXISTS idx_request_logs_model ON request_logs(model_name)",
    )
    .execute(db)
    .await?;

    sqlx::query(
        "CREATE INDEX IF NOT EXISTS idx_request_logs_source ON request_logs(source_tag)",
    )
    .execute(db)
    .await?;

    // 每日统计表
    sqlx::query(
        r#"
        CREATE TABLE IF NOT EXISTS daily_stats (
            date            TEXT NOT NULL,
            model_name      TEXT NOT NULL,
            source_tag      TEXT NOT NULL,
            total_requests  INTEGER NOT NULL DEFAULT 0,
            total_tokens    INTEGER NOT NULL DEFAULT 0,
            prompt_tokens   INTEGER NOT NULL DEFAULT 0,
            completion_tokens INTEGER NOT NULL DEFAULT 0,
            cache_hits      INTEGER NOT NULL DEFAULT 0,
            total_spend     REAL NOT NULL DEFAULT 0,
            PRIMARY KEY (date, model_name, source_tag)
        )
        "#,
    )
    .execute(db)
    .await?;

    // 系统设置表
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

    // ── 增量 migration：v1.1 加缓存token数 ──
    // SQLite 不支持 ADD COLUMN IF NOT EXISTS，忽略已存在列的错误
    let _ = sqlx::query(
        "ALTER TABLE request_logs ADD COLUMN cached_tokens INTEGER NOT NULL DEFAULT 0",
    )
    .execute(db)
    .await;

    let _ = sqlx::query(
        "ALTER TABLE daily_stats ADD COLUMN cached_tokens INTEGER NOT NULL DEFAULT 0",
    )
    .execute(db)
    .await;

    // ── v1.2: 缓存价格（¥/1M tokens，缓存命中输入token用此价格） ──
    let _ = sqlx::query(
        "ALTER TABLE models ADD COLUMN cache_price REAL NOT NULL DEFAULT 0",
    )
    .execute(db)
    .await;

    // ── v1.3: 提供商管理表 ──
    sqlx::query(
        r#"
        CREATE TABLE IF NOT EXISTS providers (
            id              TEXT PRIMARY KEY,
            name            TEXT NOT NULL UNIQUE,
            api_base        TEXT NOT NULL,
            encrypted_api_key BLOB NOT NULL,
            created_at      TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
        )
        "#,
    )
    .execute(db)
    .await?;

    // ── v1.4: 去掉 model_name UNIQUE，允许同名模型多提供商 ──
    // ── v1.5: 加 upstream_model_name 字段 ──
    let _ = sqlx::query(
        "ALTER TABLE models ADD COLUMN upstream_model_name TEXT NOT NULL DEFAULT ''",
    )
    .execute(db)
    .await;

    // ── v1.6: 加 tokens_per_second 字段 ──
    let _ = sqlx::query(
        "ALTER TABLE request_logs ADD COLUMN tokens_per_second REAL NOT NULL DEFAULT 0",
    )
    .execute(db)
    .await;
    {
        // 清理可能残留的 models_new（上次迁移中断遗留）
        let _ = sqlx::query("DROP TABLE IF EXISTS models_new").execute(db).await;

        let ddl: Result<(String,), _> = sqlx::query_as(
            "SELECT sql FROM sqlite_master WHERE type='table' AND name='models'",
        )
        .fetch_one(db)
        .await;

        let need_migrate = match ddl {
            Ok((sql,)) => sql.contains("UNIQUE"),
            Err(_) => {
                // models 表不存在，需要创建
                tracing::warn!("models 表不存在，创建无 UNIQUE 版本");
                true
            }
        };

        if need_migrate {
            tracing::info!("执行 v1.4 迁移：去掉 model_name UNIQUE 约束");
            sqlx::query(
                r#"
                CREATE TABLE models_new (
                    id              TEXT PRIMARY KEY,
                    model_name      TEXT NOT NULL,
                    provider        TEXT NOT NULL,
                    api_base        TEXT NOT NULL,
                    encrypted_api_key BLOB NOT NULL,
                    input_price     REAL NOT NULL DEFAULT 0,
                    output_price    REAL NOT NULL DEFAULT 0,
                    cache_price     REAL NOT NULL DEFAULT 0,
                    model_type      TEXT NOT NULL DEFAULT 'chat',
                    upstream_model_name TEXT NOT NULL DEFAULT '',
                    created_at      TEXT NOT NULL DEFAULT (datetime('now')),
                    updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
                )
                "#,
            )
            .execute(db)
            .await?;
            // 复制数据（如果旧表存在且列数匹配）
            let _ = sqlx::query("INSERT OR IGNORE INTO models_new (id, model_name, provider, api_base, encrypted_api_key, input_price, output_price, cache_price, model_type, created_at, updated_at) SELECT id, model_name, provider, api_base, encrypted_api_key, input_price, output_price, cache_price, model_type, created_at, updated_at FROM models")
                .execute(db)
                .await;
            let _ = sqlx::query("DROP TABLE IF EXISTS models").execute(db).await;
            sqlx::query("ALTER TABLE models_new RENAME TO models")
                .execute(db)
                .await?;
            tracing::info!("v1.4 迁移完成");
        }
    }

    Ok(())
}
