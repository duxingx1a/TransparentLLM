//! 用量解析器
//!
//! 根据不同提供商格式提取 token 用量和缓存命中信息

/// 解析后的用量统计
#[derive(Debug, Default, Clone)]
pub struct UsageStats {
    pub total_tokens: u32,
    pub prompt_tokens: u32,
    pub completion_tokens: u32,
    pub cache_hit: bool,
    pub cache_key: Option<String>,
    /// 缓存命中的 token 数量（OpenAI: prompt_tokens_details.cached_tokens）
    pub cached_tokens: u32,
}

/// 根据提供商类型解析用量
pub fn parse_usage(provider: &str, response_body: &serde_json::Value) -> UsageStats {
    match provider {
        "openai" => parse_openai(response_body),
        "anthropic" => parse_anthropic(response_body),
        _ => {
            // 先尝试 OpenAI 格式，再尝试 Anthropic
            let stats = parse_openai(response_body);
            if stats.total_tokens > 0 {
                stats
            } else {
                parse_anthropic(response_body)
            }
        }
    }
}

/// OpenAI 兼容格式
///
/// 响应结构:
/// ```json
/// {
///   "usage": {
///     "prompt_tokens": 10,
///     "completion_tokens": 20,
///     "total_tokens": 30,
///     "prompt_tokens_details": {
///       "cached_tokens": 5
///     }
///   }
/// }
/// ```
fn parse_openai(body: &serde_json::Value) -> UsageStats {
    let usage = body.get("usage");
    let prompt_tokens = usage
        .and_then(|u| u.get("prompt_tokens"))
        .and_then(|v| v.as_u64())
        .unwrap_or(0) as u32;

    let completion_tokens = usage
        .and_then(|u| u.get("completion_tokens"))
        .and_then(|v| v.as_u64())
        .unwrap_or(0) as u32;

    let total_tokens = usage
        .and_then(|u| u.get("total_tokens"))
        .and_then(|v| v.as_u64())
        .unwrap_or(0) as u32;

    // 缓存命中检测
    let cached_tokens = usage
        .and_then(|u| u.get("prompt_tokens_details"))
        .and_then(|d| d.get("cached_tokens"))
        .and_then(|v| v.as_u64())
        .unwrap_or(0) as u32;

    let cache_hit = cached_tokens > 0;

    UsageStats {
        total_tokens,
        prompt_tokens,
        completion_tokens,
        cache_hit,
        cache_key: None,
        cached_tokens,
    }
}

/// Anthropic 兼容格式
///
/// 响应结构:
/// ```json
/// {
///   "usage": {
///     "input_tokens": 10,
///     "output_tokens": 20,
///     "cache_read_input_tokens": 5
///   }
/// }
/// ```
fn parse_anthropic(body: &serde_json::Value) -> UsageStats {
    let usage = body.get("usage");
    let input_tokens = usage
        .and_then(|u| u.get("input_tokens"))
        .and_then(|v| v.as_u64())
        .unwrap_or(0) as u32;

    let output_tokens = usage
        .and_then(|u| u.get("output_tokens"))
        .and_then(|v| v.as_u64())
        .unwrap_or(0) as u32;

    // 缓存命中检测
    let cache_read = usage
        .and_then(|u| u.get("cache_read_input_tokens"))
        .and_then(|v| v.as_u64())
        .unwrap_or(0);

    UsageStats {
        total_tokens: input_tokens + output_tokens,
        prompt_tokens: input_tokens,
        completion_tokens: output_tokens,
        cache_hit: cache_read > 0,
        cache_key: None,
        cached_tokens: cache_read as u32,
    }
}
