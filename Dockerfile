# ── 生产部署 Dockerfile（直接用已编译二进制，2 秒构建）──
# 前置条件：cargo build --release && cd frontend && npm run build
#
# 使用 scratch 基础镜像，因为 Rust 二进制是静态链接的（musl），
# 不需要任何系统库。只需复制 CA 证书支持 HTTPS 请求。

FROM scratch

# CA 证书：从 alpine 复制，支持 HTTPS 请求
COPY --from=alpine:latest /etc/ssl/certs/ca-certificates.crt /etc/ssl/certs/

WORKDIR /app

# 直接复制已编译好的二进制（前端由 nginx 统一 serve）
COPY target/release/transparentllm /app/transparentllm

EXPOSE 18400

ENV TRANSPARENTLLM_HOST=0.0.0.0
ENV TRANSPARENTLLM_PORT=18400

CMD ["./transparentllm"]
