//! SSE 流式转发
//!
//! 将上游 SSE 流逐 chunk 转发给客户端，同时在流结束后收集完整响应
//! 用于日志记录和用量统计

use std::pin::Pin;
use std::task::{Context, Poll};

use axum::body::Bytes;
use futures_util::Stream;
use reqwest::Response;
use tokio::sync::mpsc;

/// SSE 流式转发
///
/// 返回一个异步流，每收到上游的一个 chunk 就立即 yield 给客户端，
/// 同时在后台收集所有 chunk 拼接完整响应。
///
/// 流结束后调用回调函数写入日志和更新统计。
pub fn sse_stream_forward<F, Fut>(
    response: Response,
    on_complete: F,
) -> impl Stream<Item = Result<Bytes, std::convert::Infallible>>
where
    F: FnOnce(Option<serde_json::Value>, Option<String>, Option<String>) -> Fut + Send + 'static,
    Fut: std::future::Future<Output = ()> + Send,
{
    let (tx, rx) = mpsc::channel::<Result<Bytes, std::convert::Infallible>>(32);

    tokio::spawn(async move {
        let mut stream = response.bytes_stream();
        let mut full_body = Vec::new();
        let mut completion_start_time: Option<String> = None;
        let mut error_msg: Option<String> = None;
        let mut first_content_chunk = true;
        // 累积流式回复的完整内容
        let mut accumulated_content = String::new();

        use futures_util::StreamExt;
        while let Some(chunk_result) = stream.next().await {
            match chunk_result {
                Ok(bytes) => {
                    // 记录首个内容 chunk 的时间
                    if first_content_chunk {
                        if let Ok(text) = std::str::from_utf8(&bytes) {
                            if text.contains("\"delta\"") || text.contains("\"content\"") {
                                completion_start_time =
                                    Some(chrono::Utc::now().to_rfc3339());
                                first_content_chunk = false;
                            }
                        }
                    }

                    // 累积 delta.content
                    if let Ok(text) = std::str::from_utf8(&bytes) {
                        for line in text.lines() {
                            if let Some(json_str) = line.strip_prefix("data: ") {
                                if json_str == "[DONE]" {
                                    continue;
                                }
                                if let Ok(chunk) = serde_json::from_str::<serde_json::Value>(json_str) {
                                    if let Some(delta) = chunk.get("choices")
                                        .and_then(|c| c.get(0))
                                        .and_then(|c| c.get("delta"))
                                    {
                                        if let Some(content) = delta.get("content").and_then(|c| c.as_str()) {
                                            accumulated_content.push_str(content);
                                        }
                                    }
                                }
                            }
                        }
                    }

                    full_body.extend_from_slice(&bytes);

                    if tx.send(Ok(bytes)).await.is_err() {
                        // 客户端断开连接
                        break;
                    }
                }
                Err(e) => {
                    error_msg = Some(format!("SSE 流读取错误: {}", e));
                    break;
                }
            }
        }

        // 尝试解析完整响应体
        let mut parsed_body = std::str::from_utf8(&full_body)
            .ok()
            .and_then(|text| {
                // 提取最后一个有效的 JSON 行（包含 usage 信息）
                text.lines()
                    .filter(|line| line.starts_with("data: "))
                    .filter_map(|line| {
                        let json_str = &line[6..]; // 去掉 "data: " 前缀
                        if json_str == "[DONE]" {
                            None
                        } else {
                            serde_json::from_str::<serde_json::Value>(json_str).ok()
                        }
                    })
                    .last()
            });

        // 将累积的完整内容注入到响应体中，便于日志记录
        if !accumulated_content.is_empty() {
            if let Some(ref mut body) = parsed_body {
                if let Some(choices) = body.get_mut("choices") {
                    if let Some(first) = choices.get_mut(0) {
                        // 设置 message.content（非流式格式），便于详情页提取
                        first.as_object_mut().and_then(|obj| {
                            obj.insert("message".into(), serde_json::json!({
                                "role": "assistant",
                                "content": accumulated_content,
                            }))
                        });
                    }
                }
            }
        }

        // 调用完成回调
        on_complete(parsed_body, completion_start_time, error_msg).await;
    });

    // 将 mpsc receiver 包装为 Stream
    SseReceiverStream { rx }
}

/// mpsc receiver 的 Stream 包装
struct SseReceiverStream {
    rx: mpsc::Receiver<Result<Bytes, std::convert::Infallible>>,
}

impl Stream for SseReceiverStream {
    type Item = Result<Bytes, std::convert::Infallible>;

    fn poll_next(mut self: Pin<&mut Self>, cx: &mut Context<'_>) -> Poll<Option<Self::Item>> {
        self.rx.poll_recv(cx)
    }
}
