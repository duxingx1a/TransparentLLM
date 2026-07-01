//! 加密工具模块
//!
//! 提供 AES-256-GCM 加密/解密（用于上游 API Key 保护）

use aes_gcm::{
    aead::{Aead, KeyInit, OsRng},
    Aes256Gcm, Nonce,
};
use rand::RngCore;
use sha2::{Digest, Sha256};

/// 加密明文数据
///
/// 返回格式: [12字节nonce][密文]，nonce 和密文拼接
pub fn encrypt(plaintext: &[u8], key: &[u8]) -> Result<Vec<u8>, String> {
    let cipher = Aes256Gcm::new_from_slice(key).map_err(|e| format!("无效的加密密钥: {}", e))?;

    let mut nonce_bytes = [0u8; 12];
    OsRng.fill_bytes(&mut nonce_bytes);
    let nonce = Nonce::from_slice(&nonce_bytes);

    let ciphertext = cipher
        .encrypt(nonce, plaintext)
        .map_err(|e| format!("加密失败: {}", e))?;

    // nonce + 密文
    let mut result = nonce_bytes.to_vec();
    result.extend_from_slice(&ciphertext);
    Ok(result)
}

/// 解密密文数据
///
/// 输入格式: [12字节nonce][密文]
pub fn decrypt(encrypted: &[u8], key: &[u8]) -> Result<Vec<u8>, String> {
    if encrypted.len() < 12 {
        return Err("密文太短，无法解密".into());
    }

    let cipher = Aes256Gcm::new_from_slice(key).map_err(|e| format!("无效的加密密钥: {}", e))?;

    let (nonce_bytes, ciphertext) = encrypted.split_at(12);
    let nonce = Nonce::from_slice(nonce_bytes);

    cipher
        .decrypt(nonce, ciphertext)
        .map_err(|e| format!("解密失败（密钥不匹配或数据损坏）: {}", e))
}

/// SHA-256 哈希（用于主 Key 存储）
pub fn sha256_hash(input: &str) -> String {
    hex::encode(Sha256::digest(input.as_bytes()))
}

/// constant-time 哈希比较（防时序攻击）
pub fn constant_time_eq(a: &str, b: &str) -> bool {
    use subtle::ConstantTimeEq;
    a.as_bytes().ct_eq(b.as_bytes()).into()
}
