//! 应用配置模块
//!
//! 从环境变量读取配置，提供合理的默认值

/// 应用配置
#[derive(Clone)]
pub struct AppConfig {
    /// 监听地址，默认 127.0.0.1
    pub host: String,
    /// 监听端口，默认 18400
    pub port: u16,
    /// PostgreSQL 数据库连接字符串
    pub database_url: String,
    /// 主密钥（SHA-256 哈希存储）
    pub master_key_hash: Option<String>,
    /// 日志保留天数，默认 30
    pub log_retention_days: i64,
}

impl AppConfig {
    /// 从环境变量加载配置
    pub fn from_env() -> anyhow::Result<Self> {
        let master_key = std::env::var("TRANSPARENTLLM_MASTER_KEY").ok();

        Ok(Self {
            host: std::env::var("TRANSPARENTLLM_HOST").unwrap_or_else(|_| "127.0.0.1".into()),
            port: std::env::var("TRANSPARENTLLM_PORT")
                .ok()
                .and_then(|p| p.parse().ok())
                .unwrap_or(18400),
            database_url: std::env::var("TRANSPARENTLLM_DATABASE_URL")
                .unwrap_or_else(|_| "postgres://ydl@localhost:5432/transparentllm".into()),
            master_key_hash: master_key.map(|k| {
                use sha2::{Digest, Sha256};
                hex::encode(Sha256::digest(k.as_bytes()))
            }),
            log_retention_days: std::env::var("TRANSPARENTLLM_LOG_RETENTION_DAYS")
                .ok()
                .and_then(|d| d.parse().ok())
                .unwrap_or(7),
        })
    }
}
