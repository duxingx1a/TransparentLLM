//! 来源标签模块
//!
//! 从 HTTP User-Agent 头自动解析请求来源标签

/// 解析请求来源标签
///
/// 优先读 `X-Source` 请求头（前端可控），fallback 到 User-Agent 自动识别
pub fn parse_source_tag(user_agent: &str, x_source: &str) -> &'static str {
    // 优先使用 X-Source 头（前端显式指定的来源）
    if !x_source.is_empty() {
        let src = x_source.trim().to_lowercase();
        if src == "transparentllm" { return "TransparentLLM"; }
        // 也支持其他自定义来源
        if !src.is_empty() && src != "unknown" { return "unknown"; }
    }

    let ua_lower = user_agent.to_lowercase();

    if ua_lower.contains("copilot") { return "copilot"; }
    if ua_lower.contains("hermes") { return "hermes"; }
    if ua_lower.contains("codex") { return "codex"; }
    if ua_lower.contains("python-requests") || ua_lower.contains("python/") { return "python"; }
    if ua_lower.starts_with("curl/") { return "curl"; }
    if ua_lower.contains("go-http-client") { return "go"; }
    if ua_lower.contains("node-fetch") || ua_lower.contains("node.js") { return "node"; }

    "unknown"
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
}
