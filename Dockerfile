# ── 生产部署 Dockerfile（直接用已编译二进制，2 秒构建）──
# 前置条件：cargo build --release && cd frontend && npm run build

FROM debian:bookworm-slim

RUN apt-get update -qq && apt-get install -y -qq ca-certificates tzdata curl > /dev/null 2>&1 && \
    ln -sf /usr/share/zoneinfo/Asia/Shanghai /etc/localtime && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

# 直接复制已编译好的二进制（前端由 nginx 统一 serve）
COPY target/release/transparentllm /app/transparentllm

EXPOSE 18400

ENV TRANSPARENTLLM_HOST=0.0.0.0
ENV TRANSPARENTLLM_PORT=18400

CMD ["./transparentllm"]
