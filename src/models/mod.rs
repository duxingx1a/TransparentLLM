//! 模型配置模块
//!
//! 管理上游 LLM 模型的配置信息（CRUD）

use serde::{Deserialize, Serialize};
use sqlx::PgPool;

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
    /// 加密的 API Key（内部使用，不序列化到前端）
    #[serde(default, skip_serializing)]
    pub encrypted_api_key: Vec<u8>,
    /// 解密的 API Key（返回前端供小眼睛展示，仅列表/详情接口填充）
    #[serde(default, skip_serializing_if = "String::is_empty")]
    pub decrypted_api_key: String,
    /// 上游真实模型名（转发时使用，默认等于 model_name）
    #[serde(default)]
    pub upstream_model_name: String,
}

/// 创建模型的请求体
#[derive(Debug, Deserialize)]
pub struct CreateModelRequest {
    pub model_name: String,
    pub provider: String,
    pub api_base: String,
    pub api_key: String,
    /// 上游真实模型名（可选，默认等于 model_name）
    #[serde(default)]
    pub upstream_model_name: Option<String>,
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
    pub upstream_model_name: Option<String>,
    pub input_price: Option<f64>,
    pub output_price: Option<f64>,
    pub cache_price: Option<f64>,
    pub model_type: Option<String>,
}

/// 获取所有模型
pub async fn list_models(db: &PgPool) -> anyhow::Result<Vec<ModelConfig>> {
    let rows = sqlx::query_as::<_, ModelRow>(
        r#"
        SELECT id, model_name, provider, api_base, input_price, output_price, cache_price,
               model_type, created_at, updated_at, encrypted_api_key, upstream_model_name
        FROM models ORDER BY created_at DESC
        "#,
    )
    .fetch_all(db)
    .await?;

    Ok(rows.into_iter().map(|r| r.into_config()).collect())
}

/// 获取单个模型
pub async fn get_model(db: &PgPool, id: &str) -> anyhow::Result<Option<ModelConfig>> {
    let row = sqlx::query_as::<_, ModelRow>(
        r#"
        SELECT id, model_name, provider, api_base, input_price, output_price, cache_price,
               model_type, created_at, updated_at, encrypted_api_key, upstream_model_name
        FROM models WHERE id = $1
        "#,
    )
    .bind(id)
    .fetch_optional(db)
    .await?;

    Ok(row.map(|r| r.into_config()))
}

/// 按模型名称查找（用于代理路由匹配）
pub async fn get_model_by_name(
    db: &PgPool,
    model_name: &str,
) -> anyhow::Result<Option<ModelConfigFull>> {
    let row = sqlx::query_as::<_, ModelRow>(
        r#"
        SELECT id, model_name, provider, api_base, input_price, output_price, cache_price,
               model_type, created_at, updated_at, encrypted_api_key, upstream_model_name
        FROM models WHERE model_name = $1
        "#,
    )
    .bind(model_name)
    .fetch_optional(db)
    .await?;

    Ok(row.map(|r| r.into_full()))
}

/// 按模型名称 + 提供商精确查找（优先匹配，用于代理路由）
pub async fn get_model_by_name_and_provider(
    db: &PgPool,
    model_name: &str,
    provider: &str,
) -> anyhow::Result<Option<ModelConfigFull>> {
    let row = sqlx::query_as::<_, ModelRow>(
        r#"
        SELECT id, model_name, provider, api_base, input_price, output_price, cache_price,
               model_type, created_at, updated_at, encrypted_api_key, upstream_model_name
        FROM models WHERE model_name = $1 AND provider = $2
        "#,
    )
    .bind(model_name)
    .bind(provider)
    .fetch_optional(db)
    .await?;

    Ok(row.map(|r| r.into_full()))
}

/// 创建模型
pub async fn create_model(
    db: &PgPool,
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
                           input_price, output_price, cache_price, model_type, upstream_model_name)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
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
    .bind(&req.upstream_model_name.as_deref().unwrap_or(&req.model_name))
    .execute(db)
    .await?;

    get_model(db, &id)
        .await?
        .ok_or_else(|| anyhow::anyhow!("创建失败"))
}

/// 更新模型
pub async fn update_model(
    db: &PgPool,
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
    let upstream_model_name = req.upstream_model_name.unwrap_or(existing.as_ref().unwrap().upstream_model_name.clone());

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
            model_name = $1, provider = $2, api_base = $3, encrypted_api_key = $4,
            input_price = $5, output_price = $6, cache_price = $7, model_type = $8,
            upstream_model_name = $9,
            updated_at = NOW()
        WHERE id = $10
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
    .bind(&upstream_model_name)
    .bind(id)
    .execute(db)
    .await?;

    get_model(db, id).await
}

/// 删除模型
pub async fn delete_model(db: &PgPool, id: &str) -> anyhow::Result<bool> {
    let result = sqlx::query("DELETE FROM models WHERE id = $1")
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
    pub upstream_model_name: String,
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
    created_at: chrono::DateTime<chrono::Utc>,
    updated_at: chrono::DateTime<chrono::Utc>,
    encrypted_api_key: Vec<u8>,
    upstream_model_name: String,
}

impl ModelRow {
    fn into_config(self) -> ModelConfig {
        let has_key = !self.encrypted_api_key.is_empty();
        ModelConfig {
            id: self.id,
            model_name: self.model_name,
            provider: self.provider,
            api_base: self.api_base,
            input_price: self.input_price,
            output_price: self.output_price,
            cache_price: self.cache_price,
            model_type: self.model_type,
            created_at: self.created_at.to_rfc3339(),
            updated_at: self.updated_at.to_rfc3339(),
            has_key,
            encrypted_api_key: self.encrypted_api_key,
            decrypted_api_key: String::new(),
            upstream_model_name: self.upstream_model_name,
        }
    }

    fn into_full(self) -> ModelConfigFull {
        ModelConfigFull {
            id: self.id,
            model_name: self.model_name,
            provider: self.provider,
            api_base: self.api_base,
            api_key: String::new(),
            input_price: self.input_price,
            output_price: self.output_price,
            cache_price: self.cache_price,
            model_type: self.model_type,
            encrypted_api_key: self.encrypted_api_key,
            upstream_model_name: self.upstream_model_name,
        }
    }
}

async fn get_model_by_name_id(
    db: &PgPool,
    id: &str,
) -> anyhow::Result<Option<ModelConfigFull>> {
    let row = sqlx::query_as::<_, ModelRow>(
        "SELECT * FROM models WHERE id = $1",
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

// ── 提供商管理 ──

/// 提供商配置（返回给前端）
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProviderConfig {
    pub id: String,
    pub name: String,
    pub api_base: String,
    pub decrypted_api_key: String,
    pub created_at: String,
    pub updated_at: String,
}

/// 创建提供商的请求体
#[derive(Debug, Deserialize)]
pub struct CreateProviderRequest {
    pub name: String,
    pub api_base: String,
    pub api_key: String,
}

/// 更新提供商的请求体（所有字段可选）
#[derive(Debug, Deserialize)]
pub struct UpdateProviderRequest {
    pub name: Option<String>,
    pub api_base: Option<String>,
    pub api_key: Option<String>,
}

/// 获取所有提供商
pub async fn list_providers(db: &PgPool) -> anyhow::Result<Vec<ProviderRow>> {
    let rows = sqlx::query_as::<_, ProviderRow>(
        r#"SELECT id, name, api_base, encrypted_api_key, created_at, updated_at
           FROM providers ORDER BY created_at DESC"#,
    )
    .fetch_all(db)
    .await?;

    Ok(rows)
}

/// 获取单个提供商
pub async fn get_provider(db: &PgPool, id: &str) -> anyhow::Result<Option<ProviderRow>> {
    sqlx::query_as::<_, ProviderRow>(
        r#"SELECT id, name, api_base, encrypted_api_key, created_at, updated_at
           FROM providers WHERE id = $1"#,
    )
    .bind(id)
    .fetch_optional(db)
    .await
    .map_err(|e| e.into())
}

/// 按名称获取提供商（用于代理路由自动获取 key）
pub async fn get_provider_by_name(db: &PgPool, name: &str) -> anyhow::Result<Option<ProviderRow>> {
    sqlx::query_as::<_, ProviderRow>(
        r#"SELECT id, name, api_base, encrypted_api_key, created_at, updated_at
           FROM providers WHERE name = $1"#,
    )
    .bind(name)
    .fetch_optional(db)
    .await
    .map_err(|e| e.into())
}

/// 创建提供商
pub async fn create_provider(
    db: &PgPool,
    req: CreateProviderRequest,
    encryption_key: &[u8],
) -> anyhow::Result<ProviderConfig> {
    let id = uuid::Uuid::new_v4().to_string();
    let encrypted_key = crypto::encrypt(req.api_key.as_bytes(), encryption_key)
        .map_err(|e| anyhow::anyhow!(e))?;

    sqlx::query(
        r#"INSERT INTO providers (id, name, api_base, encrypted_api_key)
           VALUES ($1, $2, $3, $4)"#,
    )
    .bind(&id)
    .bind(&req.name)
    .bind(&req.api_base)
    .bind(&encrypted_key)
    .execute(db)
    .await?;

    let row = get_provider(db, &id)
        .await?
        .ok_or_else(|| anyhow::anyhow!("创建失败"))?;

    let decrypted_api_key = decrypt_api_key(&row.encrypted_api_key, encryption_key).unwrap_or_default();

    Ok(row.into_config(decrypted_api_key))
}

/// 更新提供商
pub async fn update_provider(
    db: &PgPool,
    id: &str,
    req: UpdateProviderRequest,
    encryption_key: &[u8],
) -> anyhow::Result<Option<ProviderConfig>> {
    let existing = get_provider(db, id).await?;
    let Some(existing) = existing else {
        return Ok(None);
    };

    let name = req.name.unwrap_or(existing.name.clone());
    let api_base = req.api_base.unwrap_or(existing.api_base.clone());

    let encrypted_key = if let Some(ref new_key) = req.api_key {
        crypto::encrypt(new_key.as_bytes(), encryption_key)
            .map_err(|e| anyhow::anyhow!(e))?
    } else {
        existing.encrypted_api_key.clone()
    };

    sqlx::query(
        r#"UPDATE providers SET name = $1, api_base = $2, encrypted_api_key = $3,
           updated_at = NOW() WHERE id = $4"#,
    )
    .bind(&name)
    .bind(&api_base)
    .bind(&encrypted_key)
    .bind(id)
    .execute(db)
    .await?;

    let row = get_provider(db, id).await?.unwrap();
    let decrypted_api_key = decrypt_api_key(&row.encrypted_api_key, encryption_key).unwrap_or_default();

    Ok(Some(row.into_config(decrypted_api_key)))
}

/// 删除提供商
pub async fn delete_provider(db: &PgPool, id: &str) -> anyhow::Result<bool> {
    let result = sqlx::query("DELETE FROM providers WHERE id = $1")
        .bind(id)
        .execute(db)
        .await?;
    Ok(result.rows_affected() > 0)
}

// ── Provider 内部辅助 ──

/// 提供商数据库行
#[derive(Debug, sqlx::FromRow)]
pub struct ProviderRow {
    pub id: String,
    pub name: String,
    pub api_base: String,
    pub encrypted_api_key: Vec<u8>,
    pub created_at: chrono::DateTime<chrono::Utc>,
    pub updated_at: chrono::DateTime<chrono::Utc>,
}

impl ProviderRow {
    pub fn into_config(self, decrypted_api_key: String) -> ProviderConfig {
        ProviderConfig {
            id: self.id,
            name: self.name,
            api_base: self.api_base,
            decrypted_api_key,
            created_at: self.created_at.to_rfc3339(),
            updated_at: self.updated_at.to_rfc3339(),
        }
    }
}
