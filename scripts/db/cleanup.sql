-- ============================================================================
-- TransparentLLM 滑动窗口清理
-- 每天由 maintenance.sh 在清理步骤调用
-- 顺序：重建 daily_stats → 7天清body → 30天删记录
-- ============================================================================

-- 1. 重建 daily_stats（确保统计和备份前数据完整）
INSERT INTO daily_stats (date, model_name, source_tag, total_requests, total_tokens, prompt_tokens, completion_tokens, cache_hits, cached_tokens, total_spend, failed_requests)
SELECT
    DATE(start_time) as date,
    model_name,
    source_tag,
    COUNT(*)::bigint as total_requests,
    SUM(total_tokens)::bigint as total_tokens,
    SUM(prompt_tokens)::bigint as prompt_tokens,
    SUM(completion_tokens)::bigint as completion_tokens,
    SUM(CASE WHEN cache_hit != 0 THEN 1 ELSE 0 END)::bigint as cache_hits,
    SUM(cached_tokens)::bigint as cached_tokens,
    SUM(spend) as total_spend,
    SUM(CASE WHEN status != 'success' THEN 1 ELSE 0 END)::bigint as failed_requests
FROM request_logs
WHERE start_time >= CURRENT_DATE - INTERVAL '1 day'
GROUP BY DATE(start_time), model_name, source_tag
ON CONFLICT(date, model_name, source_tag) DO UPDATE SET
    total_requests        = EXCLUDED.total_requests,
    total_tokens          = EXCLUDED.total_tokens,
    prompt_tokens         = EXCLUDED.prompt_tokens,
    completion_tokens     = EXCLUDED.completion_tokens,
    cache_hits            = EXCLUDED.cache_hits,
    cached_tokens         = EXCLUDED.cached_tokens,
    total_spend           = EXCLUDED.total_spend,
    failed_requests       = EXCLUDED.failed_requests;

-- 2. 7天前的记录：清空 messages 和 response（保留指标）
UPDATE request_logs
SET messages = NULL, response = NULL
WHERE created_at < CURRENT_DATE - INTERVAL '7 days'
  AND (messages IS NOT NULL OR response IS NOT NULL);

-- 3. 30天前的记录：直接删除
DELETE FROM request_logs
WHERE created_at < CURRENT_DATE - INTERVAL '30 days';
