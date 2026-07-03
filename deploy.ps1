# TransparentLLM 一键部署脚本（WSL Docker 编译 → 镜像 → 服务器）
# 前提：WSL2 + Docker Engine 已安装
# 使用：.\deploy.ps1

param(
    [string]$Server = "ydl-server_new",
    [string]$RemoteDir = "/root/ydl-projects/transparentllm",
    [string]$Key = "bf2899b73b3373cd09b84d8017ef9455"
)

$ErrorActionPreference = "Stop"
$WslPath = "/mnt/c/Users/ydl/Desktop/TransparentLLM"

# 启动 Docker daemon
Write-Host "=== 0/4 启动 Docker ===" -ForegroundColor Cyan
wsl -u root service docker start 2>&1 | Out-Null

# 1. 编译前端
Write-Host "=== 1/4 编译前端 ===" -ForegroundColor Cyan
Push-Location $PSScriptRoot\frontend
npm run build
Pop-Location

# 2. 编译后端 Linux 二进制 + 构建 Docker 镜像
Write-Host "`n=== 2/4 编译后端 + 构建镜像 ===" -ForegroundColor Cyan

# 确保 cargo 缓存 volume 存在（避免每次重新下载依赖）
wsl -u root docker volume create cargo-cache 2>&1 | Out-Null

wsl -u root bash -c "cd ${WslPath} && docker run --rm -v cargo-cache:/usr/local/cargo/registry -v '${WslPath}/cargo-config.toml:/usr/local/cargo/config.toml:ro' -v '${WslPath}:/app' -w /app rust:alpine sh -c 'apk add --no-cache musl-dev openssl-dev pkgconfig && cargo build --release'"
if ($LASTEXITCODE -ne 0) { Write-Host "编译失败!" -ForegroundColor Red; exit 1 }

wsl -u root bash -c "cd ${WslPath} && docker build -t transparentllm:latest ."

# 3. 导出镜像 + 上传（含前端文件和 nginx 配置）
Write-Host "`n=== 3/4 上传镜像 + 前端文件 ===" -ForegroundColor Cyan
wsl -u root bash -c "cd ${WslPath} && docker save transparentllm:latest -o /mnt/c/Users/ydl/Desktop/TransparentLLM/transparentllm.tar"

ssh $Server "mkdir -p $RemoteDir/frontend/out /root/ydl-projects/nginx/sites/llm"

# 上传镜像、compose、nginx配置
scp transparentllm.tar docker-compose.yaml ${Server}:$RemoteDir/
scp llm.nginx.conf ${Server}:/root/ydl-projects/nginx/config/conf.d/locations/llm.conf

# 上传前端文件到两个位置（transparentllm 项目目录 + nginx sites）
scp -r $PSScriptRoot\frontend\out\* ${Server}:$RemoteDir/frontend/out/
ssh $Server "cp -r $RemoteDir/frontend/out/* /root/ydl-projects/nginx/sites/llm/"
# 保留 transparentllm.tar 不删除（下次部署可复用）

# 4. 服务器加载镜像 + 启动
Write-Host "`n=== 4/4 服务器启动 ===" -ForegroundColor Cyan

$remoteCmd = "cd $RemoteDir; docker compose down --remove-orphans 2>/dev/null || true; sed -i 's/change-me-to-32-byte-secret-key!!/$Key/' docker-compose.yaml; docker load -i transparentllm.tar; docker compose up -d; sleep 5; docker exec nginx-proxy nginx -s reload 2>&1; echo '=== 验证 ==='; curl -so /dev/null -w '/llm/ HTTP:%{http_code}' http://127.0.0.1/llm/; echo ''; curl -so /dev/null -w '/llm/ui/ HTTP:%{http_code}' http://127.0.0.1/llm/ui/; echo ' /llm/ui/'; curl -so /dev/null -w '/llm/ui/login HTTP:%{http_code}' http://127.0.0.1/llm/ui/login; echo ' /llm/ui/login'"

ssh $Server $remoteCmd

Write-Host "`n部署完成! http://8.137.187.63/llm/ (API文档)  http://8.137.187.63/llm/ui/ (管理面板)" -ForegroundColor Green
