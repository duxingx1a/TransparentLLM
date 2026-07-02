# TransparentLLM 一键部署脚本（本地编译 → Docker 镜像 → 服务器）
# 前提：Docker Desktop 已启动
# 使用：.\deploy.ps1

param(
    [string]$Server = "ydl-server_new",
    [string]$RemoteDir = "/root/transparentllm",
    [string]$Key = "bf2899b73b3373cd09b84d8017ef9455"
)

$ErrorActionPreference = "Stop"

# 1. 编译前端
Write-Host "=== 1/4 编译前端 ===" -ForegroundColor Cyan
Push-Location $PSScriptRoot\frontend
npm run build
Pop-Location

# 2. 编译后端 Linux 二进制 + 构建 Docker 镜像
Write-Host "`n=== 2/4 编译后端 + 构建镜像 ===" -ForegroundColor Cyan

docker run --rm `
    -v "${PSScriptRoot}:/app" `
    -w /app `
    rust:1.85-alpine `
    sh -c "apk add --no-cache musl-dev openssl-dev pkgconfig && cargo build --release"

if ($LASTEXITCODE -ne 0) { Write-Host "编译失败!" -ForegroundColor Red; exit 1 }

docker build -t transparentllm:latest .

# 3. 导出镜像 + 上传
Write-Host "`n=== 3/4 上传镜像 ===" -ForegroundColor Cyan
docker save transparentllm:latest -o transparentllm.tar

ssh $Server "mkdir -p $RemoteDir"
scp transparentllm.tar docker-compose.yaml ${Server}:$RemoteDir/
Remove-Item transparentllm.tar

# 4. 服务器加载镜像 + 启动
Write-Host "`n=== 4/4 服务器启动 ===" -ForegroundColor Cyan

# 单引号 Here-String 防止本地变量展开
$remoteScript = @'
cd '{0}'
fuser -k 18400/tcp 2>/dev/null || true
docker compose down 2>/dev/null || true
sed -i 's/change-me-to-32-byte-secret-key!!/'{1}'/' docker-compose.yaml
docker load -i transparentllm.tar
docker compose up -d
sleep 3
curl -so /dev/null -w "%{http_code}" http://127.0.0.1:18400/ui/
echo " /ui/"
'@ -f $RemoteDir, $Key

ssh $Server $remoteScript

Write-Host "`n✅ 部署完成! http://8.137.187.63:18400/ui/" -ForegroundColor Green
