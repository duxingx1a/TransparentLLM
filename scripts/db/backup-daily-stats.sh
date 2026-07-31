#!/usr/bin/env bash
# ============================================================================
# daily_stats 每日备份
# 作为 TransparentLLM 项目的一部分管理，由服务器 cron 调用
#
# 用法: ./backup-daily-stats.sh [--retention 7]
# ============================================================================
set -euo pipefail

BACKUP_DIR="/root/backups/transparentllm"
DB_HOST="postgres"
DB_PORT="5432"
DB_USER="ydl"
DB_PASS="${TRANSPARENTLLM_DB_PASSWORD:?请设置环境变量 TRANSPARENTLLM_DB_PASSWORD}"
DB_NAME="transparentllm"
RETENTION_DAYS="${1:-7}"

mkdir -p "$BACKUP_DIR"

DATE_TAG=$(date +%Y-%m-%d)
BACKUP_FILE="$BACKUP_DIR/daily_stats-${DATE_TAG}.sql.gz"

echo "[$(date "+%Y-%m-%d %H:%M:%S")] 备份 daily_stats → $BACKUP_FILE"

docker run --rm \
    --network postgres_default \
    -e PGPASSWORD="$DB_PASS" \
    postgres:alpine \
    pg_dump -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" \
      --table=daily_stats --data-only --compress=9 \
    > "$BACKUP_FILE" 2>&1

if [ -f "$BACKUP_FILE" ] && [ -s "$BACKUP_FILE" ]; then
    echo "[$(date "+%Y-%m-%d %H:%M:%S")] 备份完成 ($(du -h "$BACKUP_FILE" | cut -f1))"
else
    echo "[$(date "+%Y-%m-%d %H:%M:%S")] 备份失败!"
    rm -f "$BACKUP_FILE"
    exit 1
fi

# 清理过期备份
find "$BACKUP_DIR" -name "daily_stats-*.sql.gz" -type f -mtime +$RETENTION_DAYS -delete
echo "[$(date "+%Y-%m-%d %H:%M:%S")] 保留最近 $RETENTION_DAYS 天备份"
