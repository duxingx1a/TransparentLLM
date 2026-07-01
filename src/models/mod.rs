//! 模型配置模块
//!
//! 管理上游 LLM 模型的配置信息（CRUD）

use serde::{Deserialize, Serialize};
use sqlx::SqlitePool;

use crate::crypto;

/// 模型配置
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ModelConfig {
    pub id: String,
    pub model_name: String,
    pub provider: String,
    pub api_base: String,
    pub input_price: f64,
    pub output_price: f64,
    /// 缓存命中时的输入价格 ¥/1M tokens（默认 0 = 和 input_price 一致）
    pub cache_price: f64,
    pub model_type: String,
    pub created_at: String,
    pub updated_at: String,
    #[serde(default)]
    pub has_key: bool,
}

/// 创建模型的请求体
#[derive(Debug, Deserialize)]
pub struct CreateModelRequest {
    pub model_name: String,
    pub provider: String,
    pub api_base: String,
    pub api_key: String,
    #[serde(default)]
    pub input_price: f64,
    #[serde(default)]
    pub output_price: f64,
    /// 缓存命中输入价格 ¥/1M tokens
    #[serde(default)]
    pub cache_price: f64,
    #[serde(default = "default_model_type")]
    pub model_type: String,
}

fn default_model_type() -> String {
    "chat".into()
}

/// 更新模型的请求体（所有字段可选）
#[derive(Debug, Deserialize)]
pub struct UpdateModelRequest {
    pub model_name: Option<String>,
    pub provider: Option<String>,
    pub api_base: Option<String>,
    pub api_key: Option<String>,
    pub input_price: Option<f64>,
    pub output_price: Option<f64>,
    pub cache_price: Option<f64>,
    pub model_type: Option<String>,
}

/// 获取所有模型
pub async fn list_models(db: &SqlitePool) -> anyhow::Result<Vec<ModelConfig>> {
    let rows = sqlx::query_as::<_, ModelRow>(
        r#"
        SELECT id, model_name, provider, api_base, input_price, output_price, cache_price,
               model_type, created_at, updated_at, encrypted_api_key
        FROM models ORDER BY created_at DESC
        "#,
    )
    .fetch_all(db)
    .await?;

    Ok(rows.into_iter().map(|r| r.into_config()).collect())
}

/// 获取单个模型
pub async fn get_model(db: &SqlitePool, id: &str) -> anyhow::Result<Option<ModelConfig>> {
    let row = sqlx::query_as::<_, ModelRow>(
        r#"
        SELECT id, model_name, provider, api_base, input_price, output_price, cache_price,
               model_type, created_at, updated_at, encrypted_api_key
        FROM models WHERE id = ?1
        "#,
    )
    .bind(id)
    .fetch_optional(db)
    .await?;

    Ok(row.map(|r| r.into_config()))
}

/// 按模型名称查找（用于代理路由匹配）
pub async fn get_model_by_name(
    db: &SqlitePool,
    model_name: &str,
) -> anyhow::Result<Option<ModelConfigFull>> {
    let row = sqlx::query_as::<_, ModelRow>(
        r#"
        SELECT id, model_name, provider, api_base, input_price, output_price, cache_price,
               model_type, created_at, updated_at, encrypted_api_key
        FROM models WHERE model_name = ?1
        "#,
    )
    .bind(model_name)
    .fetch_optional(db)
    .await?;

    Ok(row.map(|r| r.into_full()))
}

/// 创建模型
pub async fn create_model(
    db: &SqlitePool,
    req: CreateModelRequest,
    encryption_key: &[u8],
) -> anyhow::Result<ModelConfig> {
    let id = uuid::Uuid::new_v4().to_string();

    // 加密 API Key
    let encrypted_key = crypto::encrypt(req.api_key.as_bytes(), encryption_key)
        .map_err(|e| anyhow::anyhow!(e))?;

    sqlx::query(
        r#"
        INSERT INTO models (id, model_name, provider, api_base, encrypted_api_key,
                           input_price, output_price, cache_price, model_type)
        VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)
        "#,
    )
    .bind(&id)
    .bind(&req.model_name)
    .bind(&req.provider)
    .bind(&req.api_base)
    .bind(&encrypted_key)
    .bind(req.input_price)
    .bind(req.output_price)
    .bind(req.cache_price)
    .bind(&req.model_type)
    .execute(db)
    .await?;

    get_model(db, &id)
        .await?
        .ok_or_else(|| anyhow::anyhow!("创建失败"))
}

/// 更新模型
pub async fn update_model(
    db: &SqlitePool,
    id: &str,
    req: UpdateModelRequest,
    encryption_key: &[u8],
) -> anyhow::Result<Option<ModelConfig>> {
    // 先检查模型是否存在
    let existing = get_model_by_name_id(db, id).await?;
    if existing.is_none() {
        return Ok(None);
    }

    let model_name = req.model_name.unwrap_or(existing.as_ref().unwrap().model_name.clone());
    let provider = req.provider.unwrap_or(existing.as_ref().unwrap().provider.clone());
    let api_base = req.api_base.unwrap_or(existing.as_ref().unwrap().api_base.clone());
    let input_price = req.input_price.unwrap_or(existing.as_ref().unwrap().input_price);
    let output_price = req.output_price.unwrap_or(existing.as_ref().unwrap().output_price);
    let cache_price = req.cache_price.unwrap_or(existing.as_ref().unwrap().cache_price);
    let model_type = req.model_type.unwrap_or(existing.as_ref().unwrap().model_type.clone());

    // 如果传了新 Key，重新加密；否则保留旧 Key
    let encrypted_key = if let Some(ref new_key) = req.api_key {
        crypto::encrypt(new_key.as_bytes(), encryption_key)
            .map_err(|e| anyhow::anyhow!(e))?
    } else {
        existing.as_ref().unwrap().encrypted_api_key.clone()
    };

    sqlx::query(
        r#"
        UPDATE models SET
            model_name = ?1, provider = ?2, api_base = ?3, encrypted_api_key = ?4,
            input_price = ?5, output_price = ?6, cache_price = ?7, model_type = ?8,
            updated_at = datetime('now')
        WHERE id = ?9
        "#,
    )
    .bind(&model_name)
    .bind(&provider)
    .bind(&api_base)
    .bind(&encrypted_key)
    .bind(input_price)
    .bind(output_price)
    .bind(cache_price)
    .bind(&model_type)
    .bind(id)
    .execute(db)
    .await?;

    get_model(db, id).await
}

/// 删除模型
pub async fn delete_model(db: &SqlitePool, id: &str) -> anyhow::Result<bool> {
    let result = sqlx::query("DELETE FROM models WHERE id = ?1")
        .bind(id)
        .execute(db)
        .await?;

    Ok(result.rows_affected() > 0)
}

/// 解密并获取模型的完整信息（含明文 API Key，仅供代理转发使用）
pub struct ModelConfigFull {
    pub id: String,
    pub model_name: String,
    pub provider: String,
    pub api_base: String,
    pub api_key: String,
    pub input_price: f64,
    pub output_price: f64,
    pub cache_price: f64,
    pub model_type: String,
    pub encrypted_api_key: Vec<u8>,
}

// ── 内部辅助 ──

#[derive(Debug, sqlx::FromRow)]
struct ModelRow {
    id: String,
    model_name: String,
    provider: String,
    api_base: String,
    input_price: f64,
    output_price: f64,
    cache_price: f64,
    model_type: String,
    created_at: String,
    updated_at: String,
    encrypted_api_key: Vec<u8>,
}

impl ModelRow {
    fn into_config(self) -> ModelConfig {
        ModelConfig {
            id: self.id,
            model_name: self.model_name,
            provider: self.provider,
            api_base: self.api_base,
            input_price: self.input_price,
            output_price: self.output_price,
            cache_price: self.cache_price,
            model_type: self.model_type,
            created_at: self.created_at,
            updated_at: self.updated_at,
            has_key: !self.encrypted_api_key.is_empty(),
        }
    }

    fn into_full(self) -> ModelConfigFull {
        ModelConfigFull {
            id: self.id,
            model_name: self.model_name,
            provider: self.provider,
            api_base: self.api_base,
            api_key: String::new(), // 需要解密，由调用方处理
            input_price: self.input_price,
            output_price: self.output_price,
            cache_price: self.cache_price,
            model_type: self.model_type,
            encrypted_api_key: self.encrypted_api_key,
        }
    }
}

async fn get_model_by_name_id(
    db: &SqlitePool,
    id: &str,
) -> anyhow::Result<Option<ModelConfigFull>> {
    let row = sqlx::query_as::<_, ModelRow>(
        "SELECT * FROM models WHERE id = ?1",
    )
    .bind(id)
    .fetch_optional(db)
    .await?;

    Ok(row.map(|r| r.into_full()))
}

/// 解密 API Key（供代理转发时使用）
pub fn decrypt_api_key(encrypted: &[u8], encryption_key: &[u8]) -> Result<String, String> {
    let decrypted = crypto::decrypt(encrypted, encryption_key)?;
    String::from_utf8(decrypted).map_err(|e| format!("Key 解码失败: {}", e))
}
