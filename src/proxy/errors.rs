//! 错误分类与翻译模块
//!
//! 统一处理代理过程中产生的各种错误：
//! - 区分「上游问题」与「我们自身的问题」
//! - 对上游返回的英文原始报错给出中文翻译
//!
//! 所有错误信息统一格式：`[分类] 中文说明 | 原始报错: <raw>`

/// 错误分类
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ErrorCategory {
    /// 上游（LLM 提供商 / 内网穿透服务）的问题
    Upstream,
    /// 我们自身（代理配置 / 解析 / 内部逻辑）的问题
    Ours,
}

impl ErrorCategory {
    pub fn label(&self) -> &'static str {
        match self {
            ErrorCategory::Upstream => "上游问题",
            ErrorCategory::Ours => "我方问题",
        }
    }
}

/// 分类 + 翻译后的错误信息
#[derive(Debug, Clone)]
pub struct ClassifiedError {
    pub category: ErrorCategory,
    /// 中文说明（已翻译）
    pub message: String,
    /// 原始报错
    pub raw: String,
}

impl ClassifiedError {
    /// 生成统一格式的完整错误信息
    pub fn full(&self) -> String {
        format!("[{}] {} | 原始报错: {}", self.category.label(), self.message, self.raw)
    }
}

/// 对原始错误进行分类并翻译
///
/// 规则：
/// - 连接失败 / 超时 / 上游返回 4xx、5xx / 模型未加载 → 上游问题
/// - 配置缺失 / 响应解析失败 / 内部错误 → 我方问题
pub fn classify(raw: &str) -> ClassifiedError {
    let lower = raw.to_lowercase();

    // ── 我方问题（配置 / 解析 / 内部）──
    if lower.contains("模型未配置")
        || lower.contains("响应 json 解析失败")
        || lower.contains("响应读取失败")
        || lower.contains("响应解析失败")
    {
        return ClassifiedError {
            category: ErrorCategory::Ours,
            message: translate_ours(raw),
            raw: raw.to_string(),
        };
    }

    // ── 上游问题 ──
    if is_upstream_connect_error(&lower) {
        return ClassifiedError {
            category: ErrorCategory::Upstream,
            message: "无法连接到上游服务（可能未启动、内网穿透断开或网络不通）".to_string(),
            raw: raw.to_string(),
        };
    }
    if lower.contains("timeout") || lower.contains("超时") {
        return ClassifiedError {
            category: ErrorCategory::Upstream,
            message: "上游请求超时（上游响应过慢或服务无响应）".to_string(),
            raw: raw.to_string(),
        };
    }
    if lower.contains("model not found")
        || lower.contains("no running instances")
        || lower.contains("model_not_found")
    {
        return ClassifiedError {
            category: ErrorCategory::Upstream,
            message: "上游模型未加载或没有可用实例（请在上游服务中启动该模型）".to_string(),
            raw: raw.to_string(),
        };
    }
    if lower.contains("maximum context length")
        || lower.contains("context length")
        || lower.contains("input_tokens")
    {
        return ClassifiedError {
            category: ErrorCategory::Upstream,
            message: "请求超出上游模型的上下文长度限制（输入过长）".to_string(),
            raw: raw.to_string(),
        };
    }
    if lower.contains("cannot connect to host")
        || lower.contains("connect call failed")
        || lower.contains("connection refused")
    {
        return ClassifiedError {
            category: ErrorCategory::Upstream,
            message: "上游主机拒绝连接（服务未启动或端口不通）".to_string(),
            raw: raw.to_string(),
        };
    }
    if lower.contains("502")
        || lower.contains("bad gateway")
        || lower.contains("upstream connect error")
        || lower.contains("protocol error")
    {
        return ClassifiedError {
            category: ErrorCategory::Upstream,
            message: "上游网关错误（上游服务异常或连接被重置）".to_string(),
            raw: raw.to_string(),
        };
    }
    if lower.contains("500")
        || lower.contains("internal server error")
        || lower.contains("enginecore")
    {
        return ClassifiedError {
            category: ErrorCategory::Upstream,
            message: "上游服务内部错误（上游引擎异常）".to_string(),
            raw: raw.to_string(),
        };
    }
    if lower.contains("sse")
        || lower.contains("decoding response body")
        || lower.contains("stream")
    {
        return ClassifiedError {
            category: ErrorCategory::Upstream,
            message: "上游返回的流式数据格式异常或中断".to_string(),
            raw: raw.to_string(),
        };
    }
    if lower.contains("http 4")
        || lower.contains("bad request")
        || lower.contains("unauthorized")
        || lower.contains("forbidden")
        || lower.contains("not found")
    {
        return ClassifiedError {
            category: ErrorCategory::Upstream,
            message: "上游返回客户端错误（4xx，请检查请求参数或 API Key）".to_string(),
            raw: raw.to_string(),
        };
    }

    // 默认：无法明确判断，归为上游问题（多数错误来自上游）
    ClassifiedError {
        category: ErrorCategory::Upstream,
        message: "上游返回异常".to_string(),
        raw: raw.to_string(),
    }
}

/// 判断是否为连接类错误
fn is_upstream_connect_error(lower: &str) -> bool {
    lower.contains("error sending request for url")
        || lower.contains("connect")
        || lower.contains("无法连接到上游")
        || lower.contains("dns")
        || lower.contains("no such host")
        || lower.contains("tcp")
}

/// 我方问题的翻译
fn translate_ours(raw: &str) -> String {
    let lower = raw.to_lowercase();
    if lower.contains("模型未配置") {
        "模型未在系统中配置".to_string()
    } else if lower.contains("响应 json 解析失败") || lower.contains("响应解析失败") {
        "上游响应无法解析为 JSON（格式异常）".to_string()
    } else if lower.contains("响应读取失败") {
        "读取上游响应失败".to_string()
    } else {
        "我方处理异常".to_string()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_connect_error_is_upstream() {
        let e = classify("error sending request for url (http://8.137.187.63:50006/v1/chat/completions)");
        assert_eq!(e.category, ErrorCategory::Upstream);
        assert!(e.message.contains("无法连接"));
    }

    #[test]
    fn test_model_not_found_is_upstream() {
        let e = classify("{\"error\":{\"message\":\"Model not found or no running instances available\",\"code\":404}}");
        assert_eq!(e.category, ErrorCategory::Upstream);
        assert!(e.message.contains("模型未加载"));
    }

    #[test]
    fn test_context_length_is_upstream() {
        let e = classify("This model's maximum context length is 131072 tokens. However, you requested 500 output tokens and your prompt contains at least 130573 input tokens");
        assert_eq!(e.category, ErrorCategory::Upstream);
        assert!(e.message.contains("上下文长度"));
    }

    #[test]
    fn test_model_not_configured_is_ours() {
        let e = classify("模型未配置: qwen-test-TP2");
        assert_eq!(e.category, ErrorCategory::Ours);
        assert!(e.message.contains("未在系统中配置"));
    }

    #[test]
    fn test_parse_error_is_ours() {
        let e = classify("响应 JSON 解析失败: expected value at line 1");
        assert_eq!(e.category, ErrorCategory::Ours);
    }

    #[test]
    fn test_full_format() {
        let e = classify("error sending request for url (http://x)");
        assert!(e.full().contains("[上游问题]"));
        assert!(e.full().contains("原始报错:"));
    }
}
