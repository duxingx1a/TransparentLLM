//! 来源标签模块
//!
//! 从 HTTP User-Agent 头自动解析请求来源标签

/// 解析 User-Agent 为客户端的标签名
///
/// 匹配规则按优先级从高到低：
/// 1. copilot / hermes / codex（AI 编辑器/助手）
/// 2. python-requests / Python（脚本调用）
/// 3. curl（命令行）
/// 4. Go-http-client（Go 程序）
/// 5. node-fetch / Node.js（Node.js 程序）
/// 6. 其他 → "unknown"
pub fn parse_source_tag(user_agent: &str) -> &'static str {
    let ua_lower = user_agent.to_lowercase();

    if ua_lower.contains("copilot") {
        return "copilot";
    }
    if ua_lower.contains("hermes") {
        return "hermes";
    }
    if ua_lower.contains("codex") {
        return "codex";
    }
    if ua_lower.contains("python-requests") || ua_lower.contains("python/") {
        return "python";
    }
    if ua_lower.starts_with("curl/") {
        return "curl";
    }
    if ua_lower.contains("go-http-client") {
        return "go";
    }
    if ua_lower.contains("node-fetch") || ua_lower.contains("node.js") {
        return "node";
    }

    "unknown"
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_copilot() {
        assert_eq!(
            parse_source_tag("Copilot/1.0 (Windows; en-US)"),
            "copilot"
        );
    }

    #[test]
    fn test_parse_python() {
        assert_eq!(
            parse_source_tag("python-requests/2.31.0"),
            "python"
        );
    }

    #[test]
    fn test_parse_curl() {
        assert_eq!(
            parse_source_tag("curl/8.4.0"),
            "curl"
        );
    }

    #[test]
    fn test_parse_unknown() {
        assert_eq!(
            parse_source_tag("some-random-thing"),
            "unknown"
        );
    }
}
