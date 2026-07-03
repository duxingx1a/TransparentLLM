//! 应用配置模块
//!
//! 从环境变量读取配置，提供合理的默认值

/// 应用配置
#[derive(Clone)]
pub struct AppConfig {
    /// 监听地址，默认 127.0.0.1
    pub host: String,
    /// 监听端口，默认 14000
    pub port: u16,
    /// SQLite 数据库连接字符串
    pub database_url: String,
    /// 主密钥（SHA-256 哈希存储）
    pub master_key_hash: Option<String>,
    /// 加密密钥（AES-256-GCM，用于加密上游 API Key）
    pub encryption_key: Vec<u8>,
    /// 日志保留天数，默认 30
    pub log_retention_days: i64,
}

impl AppConfig {
    /// 从环境变量加载配置
    pub fn from_env() -> anyhow::Result<Self> {
        let master_key = std::env::var("TRANSPARENTLLM_MASTER_KEY").ok();

        // 加密密钥：32 字节用于 AES-256
        let encryption_key = match std::env::var("TRANSPARENTLLM_ENCRYPTION_KEY") {
            Ok(k) => {
                let key = k.as_bytes().to_vec();
                anyhow::ensure!(key.len() == 32, "TRANSPARENTLLM_ENCRYPTION_KEY 必须为 32 字节");
                key
            }
            Err(_) => {
                // 未设置则生成随机密钥并警告
                use rand::Rng;
                let key: Vec<u8> = rand::thread_rng().gen::<[u8; 32]>().to_vec();
                tracing::warn!("未设置 TRANSPARENTLLM_ENCRYPTION_KEY，已生成临时密钥（重启后已加密的 Key 将无法解密）");
                tracing::warn!("请设置环境变量 TRANSPARENTLLM_ENCRYPTION_KEY=<32字节随机字符串>");
                key
            }
        };

        Ok(Self {
            host: std::env::var("TRANSPARENTLLM_HOST").unwrap_or_else(|_| "127.0.0.1".into()),
            port: std::env::var("TRANSPARENTLLM_PORT")
                .ok()
                .and_then(|p| p.parse().ok())
                .unwrap_or(18400),
            database_url: std::env::var("TRANSPARENTLLM_DATABASE_URL")
                .unwrap_or_else(|_| "sqlite:data/transparentllm.db?mode=rwc".into()),
            master_key_hash: master_key.map(|k| {
                use sha2::{Digest, Sha256};
                hex::encode(Sha256::digest(k.as_bytes()))
            }),
            encryption_key,
            log_retention_days: std::env::var("TRANSPARENTLLM_LOG_RETENTION_DAYS")
                .ok()
                .and_then(|d| d.parse().ok())
                .unwrap_or(30),
        })
    }
}
