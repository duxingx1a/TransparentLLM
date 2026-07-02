# TransparentLLM 一键编译+部署脚本
# 前提：已安装 Docker Desktop 且正在运行
# 使用：.\deploy.ps1

param(
    [string]$Server = "ydl-server_new",
    [string]$RemoteDir = "/root/transparentllm"
)

Write-Host "=== 1/4 编译前端 ===" -ForegroundColor Cyan
Push-Location $PSScriptRoot/frontend
npm run build
Pop-Location

Write-Host "`n=== 2/4 Docker 编译 Linux 二进制 ===" -ForegroundColor Cyan
docker run --rm `
    -v "${PSScriptRoot}:/app" `
    -w /app `
    -e CARGO_TARGET_DIR=/app/target `
    rust:1.85-alpine `
    sh -c "apk add --no-cache musl-dev openssl-dev pkgconfig && cargo build --release"

if ($LASTEXITCODE -ne 0) {
    Write-Host "编译失败!" -ForegroundColor Red
    exit 1
}

Write-Host "`n=== 3/4 上传到服务器 ===" -ForegroundColor Cyan
ssh $Server "mkdir -p $RemoteDir/frontend/out $RemoteDir/target/release"
scp target/release/transparentllm ${Server}:$RemoteDir/target/release/
scp -r frontend/out/* ${Server}:$RemoteDir/frontend/out/

Write-Host "`n=== 4/4 重启服务 ===" -ForegroundColor Cyan
ssh $Server @"
cd $RemoteDir
fuser -k 18400/tcp 2>/dev/null
sleep 1
cp target/release/transparentllm .
TRANSPARENTLLM_HOST=0.0.0.0 \
TRANSPARENTLLM_ENCRYPTION_KEY=bf2899b73b3373cd09b84d8017ef9455 \
TRANSPARENTLLM_PORT=18400 \
TRANSPARENTLLM_FRONTEND_DIR=$RemoteDir/frontend/out \
nohup ./transparentllm > /var/log/transparentllm.log 2>&1 &
sleep 2
curl -so /dev/null -w '%{http_code}' http://127.0.0.1:18400/ui/
echo " /ui/ 状态"
"@

Write-Host "`n✅ 部署完成! http://8.137.187.63:18400/ui/" -ForegroundColor Green
