//! 鉴权模块
//!
//! 管理主 Key 的验证和 Session 管理

pub mod middleware;

use sqlx::SqlitePool;

use crate::config::AppConfig;

/// 鉴权状态
pub struct AuthState {
    /// 主 Key 的 SHA-256 哈希（如果已设置）
    master_key_hash: Option<String>,
}

impl AuthState {
    /// 初始化鉴权状态
    ///
    /// 优先从环境变量读取，其次从数据库 settings 表读取
    pub async fn new(db: &SqlitePool, config: &AppConfig) -> anyhow::Result<Self> {
        let master_key_hash = if let Some(ref h) = config.master_key_hash {
            // 环境变量中有主 Key，存入数据库并哈希
            let existing: Option<(String,)> =
                sqlx::query_as("SELECT value FROM settings WHERE key = 'master_key_hash'")
                    .fetch_optional(db)
                    .await?;

            if let Some((stored_hash,)) = existing {
                if &stored_hash != h {
                    // 环境变量和数据库不一致，以环境变量为准
                    sqlx::query(
                        "INSERT OR REPLACE INTO settings (key, value) VALUES ('master_key_hash', ?1)",
                    )
                    .bind(h)
                    .execute(db)
                    .await?;
                    tracing::info!("主 Key 已更新（以环境变量为准）");
                }
            } else {
                sqlx::query(
                    "INSERT INTO settings (key, value) VALUES ('master_key_hash', ?1)",
                )
                .bind(h)
                .execute(db)
                .await?;
                tracing::info!("主 Key 已从环境变量初始化");
            }

            Some(h.clone())
        } else {
            // 环境变量未设置，尝试从数据库读取
            let row: Option<(String,)> =
                sqlx::query_as("SELECT value FROM settings WHERE key = 'master_key_hash'")
                    .fetch_optional(db)
                    .await?;

            row.map(|(h,)| {
                tracing::info!("主 Key 已从数据库加载");
                h
            })
        };

        Ok(Self { master_key_hash })
    }

    /// 验证主 Key
    ///
    /// 返回 true 表示 Key 正确，false 表示错误
    /// 使用 constant-time 比较防时序攻击
    pub fn verify_master_key(&self, key: &str) -> bool {
        if let Some(ref stored_hash) = self.master_key_hash {
            let input_hash = crate::crypto::sha256_hash(key);
            crate::crypto::constant_time_eq(&input_hash, stored_hash)
        } else {
            false
        }
    }

    /// 是否已设置主 Key
    pub fn has_master_key(&self) -> bool {
        self.master_key_hash.is_some()
    }

    /// 更新主 Key（需要旧的 Key 验证）
    pub async fn update_master_key(
        &mut self,
        db: &SqlitePool,
        old_key: &str,
        new_key: &str,
    ) -> Result<bool, String> {
        if !self.verify_master_key(old_key) {
            return Ok(false);
        }

        let new_hash = crate::crypto::sha256_hash(new_key);

        sqlx::query("INSERT OR REPLACE INTO settings (key, value) VALUES ('master_key_hash', ?1)")
            .bind(&new_hash)
            .execute(db)
            .await
            .map_err(|e| format!("数据库错误: {}", e))?;

        self.master_key_hash = Some(new_hash);
        Ok(true)
    }
}
