# ── 生产部署 Dockerfile（直接用已编译二进制，2 秒构建）──
# 前置条件：cargo build --release && cd frontend && npm run build

FROM alpine:3.21

RUN apk add --no-cache ca-certificates sqlite-libs tzdata && \
    ln -sf /usr/share/zoneinfo/Asia/Shanghai /etc/localtime

WORKDIR /app

# 直接复制已编译好的二进制和前端文件（无需在 Docker 内编译）
COPY target/release/transparentllm /app/transparentllm
COPY frontend/out /app/frontend/out

RUN mkdir -p /app/data

EXPOSE 18400

ENV TRANSPARENTLLM_HOST=0.0.0.0
ENV TRANSPARENTLLM_FRONTEND_DIR=/app/frontend/out
ENV TRANSPARENTLLM_DATABASE_PATH=sqlite:/app/data/transparentllm.db?mode=rwc
ENV TRANSPARENTLLM_PORT=18400

CMD ["./transparentllm"]
