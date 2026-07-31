# TransparentLLM 一键部署脚本（WSL Docker 编译 → 镜像 → 服务器）
# 前提：WSL2 + Docker Engine 已安装
# 使用：.\deploy.ps1 -Key "你的32字节密钥"
# 注意：-Key 为生产加密密钥，必须显式传入（勿使用公开默认值）

param(
    [string]$Server = "ydl-server",
    [string]$RemoteDir = "/root/ydl-projects/transparentllm",
    [string]$Key = $env:TRANSPARENTLLM_ENCRYPTION_KEY
)

$ErrorActionPreference = "Stop"
$WslPath = "/mnt/e/projects/TransparentLLM"

# 校验加密密钥：必须显式提供，防止用公开默认值或空值覆盖生产配置
if ([string]::IsNullOrEmpty($Key)) {
    Write-Host "错误: 未提供加密密钥。请用 -Key 参数或设置环境变量 TRANSPARENTLLM_ENCRYPTION_KEY" -ForegroundColor Red
    exit 1
}
if ($Key.Length -ne 32) {
    Write-Host "警告: 密钥长度 ${($Key.Length)} 不是 32 字节，可能无法正常工作" -ForegroundColor Yellow
}

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
wsl -u root bash -c "cd ${WslPath} && docker save transparentllm:latest -o ${WslPath}/transparentllm.tar"

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

$remoteCmd = "cd $RemoteDir; sed -i 's/change-me-to-32-byte-secret-key!!/$Key/' docker-compose.yaml; docker load -i transparentllm.tar; docker compose up -d --force-recreate transparentllm; sleep 5; docker exec nginx-proxy nginx -s reload 2>&1; echo '=== 验证 ==='; curl -so /dev/null -w '/ui/ HTTP:%{http_code}' http://127.0.0.1/ui/; echo ''; curl -so /dev/null -w '/ui/logs HTTP:%{http_code}' http://127.0.0.1/ui/logs; echo ''; curl -so /dev/null -w '/ui/dashboard HTTP:%{http_code}' http://127.0.0.1/ui/dashboard; echo ''"

ssh $Server $remoteCmd

Write-Host "`n部署完成! http://8.137.187.63/ui/ (管理面板)" -ForegroundColor Green
