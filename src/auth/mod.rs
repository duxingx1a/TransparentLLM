//! 鉴权模块
//!
//! 管理主 Key 的验证。主密钥 SHA-256 哈希存储在数据库 settings 表中。
//! 默认主密钥为 "admin"，可通过 Web 面板修改。

pub mod middleware;

use sqlx::SqlitePool;

use crate::config::AppConfig;

/// 鉴权状态
pub struct AuthState {
    /// 主 Key 的 SHA-256 哈希
    master_key_hash: String,
}

impl AuthState {
    /// 初始化鉴权状态
    ///
    /// 优先级：环境变量（可选覆盖）> 数据库 > 默认值 "admin"
    pub async fn new(db: &SqlitePool, config: &AppConfig) -> anyhow::Result<Self> {
        let master_key_hash = if let Some(ref h) = config.master_key_hash {
            // 环境变量中设置了主 Key → 写入数据库
            sqlx::query(
                "INSERT OR REPLACE INTO settings (key, value) VALUES ('master_key_hash', ?1)",
            )
            .bind(h)
            .execute(db)
            .await?;
            tracing::info!("主 Key 已从环境变量初始化");
            h.clone()
        } else {
            // 尝试从数据库读取
            let row: Option<(String,)> =
                sqlx::query_as("SELECT value FROM settings WHERE key = 'master_key_hash'")
                    .fetch_optional(db)
                    .await?;

            match row {
                Some((hash,)) => {
                    tracing::info!("主 Key 已从数据库加载");
                    hash
                }
                None => {
                    // 数据库也没有 → 使用默认值 "admin"
                    let default_hash = crate::crypto::sha256_hash("admin");
                    sqlx::query(
                        "INSERT INTO settings (key, value) VALUES ('master_key_hash', ?1)",
                    )
                    .bind(&default_hash)
                    .execute(db)
                    .await?;
                    tracing::info!("主 Key 已初始化为默认值 'admin'");
                    default_hash
                }
            }
        };

        Ok(Self { master_key_hash })
    }

    /// 验证主 Key
    ///
    /// 返回 true 表示 Key 正确，false 表示错误
    /// 使用 constant-time 比较防时序攻击
    pub fn verify_master_key(&self, key: &str) -> bool {
        let input_hash = crate::crypto::sha256_hash(key);
        crate::crypto::constant_time_eq(&input_hash, &self.master_key_hash)
    }

    /// 是否已设置主 Key（总是 true，因为有默认值）
    pub fn has_master_key(&self) -> bool {
        true
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

        self.master_key_hash = new_hash;
        Ok(true)
    }
}
