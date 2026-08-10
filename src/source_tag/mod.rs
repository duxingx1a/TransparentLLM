//! 来源标签模块
//!
//! 从 HTTP User-Agent 头自动解析请求来源标签

/// 解析请求来源标签
///
/// 优先读 `X-Source` 请求头（前端可控），有值则原样透传（不做白名单枚举，支持任意新来源）；
/// 仅当 `X-Source` 为空时，才 fallback 到 User-Agent 自动识别；
/// 两者都识别不出时返回 `"unknown"`。
pub fn parse_source_tag(user_agent: &str, x_source: &str) -> String {
    // 优先使用 X-Source 头（前端显式指定的来源），原样返回，不做枚举
    let src = x_source.trim();
    if !src.is_empty() {
        return src.to_string();
    }

    let ua_lower = user_agent.to_lowercase();

    if ua_lower.contains("copilot") { return "copilot".to_string(); }
    if ua_lower.contains("hermes") { return "hermes".to_string(); }
    if ua_lower.contains("codex") { return "codex".to_string(); }
    if ua_lower.contains("python-requests") || ua_lower.contains("python/") { return "python".to_string(); }
    if ua_lower.starts_with("curl/") { return "curl".to_string(); }
    if ua_lower.contains("go-http-client") { return "go".to_string(); }
    if ua_lower.contains("node-fetch") || ua_lower.contains("node.js") { return "node".to_string(); }

    "unknown".to_string()
}

/// 从请求体 JSON 中检测来源标签
///
/// 某些客户端不会设置独特的 User-Agent，但请求体中有可识别的特征。
/// 目前支持：
/// - `hermes`：system prompt 包含 "Hermes Agent (by Nous Research)"
pub fn detect_source_from_body(body: &serde_json::Value) -> Option<&'static str> {
    if let Some(messages) = body.get("messages").and_then(|v| v.as_array()) {
        for msg in messages {
            if let Some(content) = msg.get("content").and_then(|v| v.as_str()) {
                if content.contains("Hermes Agent") && content.contains("Nous Research") {
                    return Some("hermes");
                }
            }
        }
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_copilot() {
        assert_eq!(parse_source_tag("Copilot/1.0 (Windows; en-US)", ""), "copilot");
    }

    #[test]
    fn test_parse_x_source_playground() {
        assert_eq!(parse_source_tag("Mozilla/5.0", "TransparentLLM"), "TransparentLLM");
    }

    #[test]
    fn test_parse_python() {
        assert_eq!(parse_source_tag("python-requests/2.31.0", ""), "python");
    }

    #[test]
    fn test_parse_curl() {
        assert_eq!(parse_source_tag("curl/8.4.0", ""), "curl");
    }

    #[test]
    fn test_parse_unknown() {
        assert_eq!(parse_source_tag("some-random-thing", ""), "unknown");
    }

    #[test]
    fn test_x_source_bug_fixed() {
        // 之前的 bug：设置 X-Source: hermes 会返回 unknown
        // 现在应该返回 "hermes"
        assert_eq!(parse_source_tag("Mozilla/5.0", "hermes"), "hermes");
        assert_eq!(parse_source_tag("Mozilla/5.0", "copilot"), "copilot");
    }

    #[test]
    fn test_x_source_passthrough_arbitrary() {
        // 任意新来源原样透传，不做白名单枚举
        assert_eq!(parse_source_tag("Mozilla/5.0", "my-new-agent"), "my-new-agent");
        assert_eq!(parse_source_tag("Mozilla/5.0", "SomeCustomSource"), "SomeCustomSource");
        // 即使 User-Agent 能识别，X-Source 也优先
        assert_eq!(parse_source_tag("python-requests/2.31.0", "custom"), "custom");
    }

    #[test]
    fn test_detect_hermes_from_body() {
        // 模拟 hermes agent 的请求体
        let body = serde_json::json!({
            "model": "deepseek-v4-flash",
            "messages": [
                {"role": "system", "content": "# SOUL.md\n\nYou run on Hermes Agent (by Nous Research)."}
            ]
        });
        assert_eq!(detect_source_from_body(&body), Some("hermes"));
    }

    #[test]
    fn test_detect_unknown_from_body() {
        // 非 hermes 的请求体
        let body = serde_json::json!({
            "model": "gpt-4",
            "messages": [
                {"role": "user", "content": "Hello"}
            ]
        });
        assert_eq!(detect_source_from_body(&body), None);
    }

    #[test]
    fn test_detect_hermes_multi_turn() {
        // hermes 请求体中有多条消息
        let body = serde_json::json!({
            "model": "deepseek-v4-flash",
            "messages": [
                {"role": "system", "content": "# SOUL.md\n\nYou run on Hermes Agent (by Nous Research)."},
                {"role": "user", "content": "Hello"}
            ]
        });
        assert_eq!(detect_source_from_body(&body), Some("hermes"));
    }
}
