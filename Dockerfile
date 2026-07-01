# ── 阶段 1：构建前端 ──
FROM node:22-alpine AS frontend-builder

WORKDIR /app/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci

COPY frontend/ ./
RUN npm run build

# ── 阶段 2：构建后端 ──
FROM rust:1.85-alpine AS backend-builder

RUN apk add --no-cache musl-dev pkgconfig openssl-dev

WORKDIR /app
COPY Cargo.toml Cargo.lock ./
COPY src/ ./src/

# 预下载依赖（利用 Docker 缓存层）
RUN mkdir -p src/bin && echo 'fn main() {}' > src/bin/dummy.rs
RUN cargo build --release 2>/dev/null || true
RUN rm -rf src/bin

RUN cargo build --release

# ── 阶段 3：运行时镜像 ──
FROM alpine:3.21

RUN apk add --no-cache ca-certificates sqlite-libs tzdata && \
    ln -sf /usr/share/zoneinfo/Asia/Shanghai /etc/localtime

WORKDIR /app

# 复制后端二进制
COPY --from=backend-builder /app/target/release/transparentllm /app/transparentllm

# 复制前端静态文件
COPY --from=frontend-builder /app/frontend/out /app/frontend/out

# 数据目录（挂载点）
RUN mkdir -p /app/data

EXPOSE 14000

ENV TRANSPARENTLLM_HOST=0.0.0.0
ENV TRANSPARENTLLM_FRONTEND_DIR=/app/frontend/out
ENV TRANSPARENTLLM_DATABASE_PATH=sqlite:/app/data/transparentllm.db?mode=rwc
ENV TRANSPARENTLLM_PORT=14000

# 加密密钥必须通过环境变量或 docker-compose 传入
# ENV TRANSPARENTLLM_ENCRYPTION_KEY=your-32-byte-key-here

CMD ["./transparentllm"]
