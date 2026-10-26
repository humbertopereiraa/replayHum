<#
.SYNOPSIS
  Gera o pacote Windows em dist\ (exe + ffmpeg + scripts de instalacao).
#>
[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"

$ScriptsDir = $PSScriptRoot
$Root = Split-Path -Parent $ScriptsDir
$Dist = Join-Path $Root "dist"
$VendorFfmpeg = Join-Path $Root "vendor\ffmpeg\ffmpeg.exe"

Set-Location $Root

if (-not (Test-Path $VendorFfmpeg)) {
    Write-Error @"
ffmpeg.exe nao encontrado em:
  $VendorFfmpeg

Baixe o build essentials 64-bit (ex.: https://www.gyan.dev/ffmpeg/builds/ffmpeg-release-essentials.zip),
copie bin\ffmpeg.exe para replay-server\vendor\ffmpeg\ e rode este script de novo.
O pacote do cliente leva o FFmpeg junto — o Mini PC nao precisa ter FFmpeg no PATH.
"@
    exit 1
}

if (-not (Get-Command go -ErrorAction SilentlyContinue)) {
    Write-Error "Go nao encontrado no PATH. Instale Go 1.22+ (https://go.dev/dl/)."
    exit 1
}

if (Test-Path $Dist) {
    Remove-Item -Path $Dist -Recurse -Force
}
New-Item -ItemType Directory -Force -Path $Dist | Out-Null

Write-Host "Compilando replay-server.exe..."
$env:GOOS = "windows"
$env:GOARCH = "amd64"
& go build -o (Join-Path $Dist "replay-server.exe") ./cmd/server
if ($LASTEXITCODE -ne 0) {
    Write-Error "go build falhou"
    exit $LASTEXITCODE
}

Copy-Item -Path $VendorFfmpeg -Destination (Join-Path $Dist "ffmpeg.exe") -Force
$vendorDir = Split-Path $VendorFfmpeg -Parent
Get-ChildItem -Path $vendorDir -Filter "*.dll" -ErrorAction SilentlyContinue |
    Copy-Item -Destination $Dist -Force

Copy-Item -Path (Join-Path $Root "config.example.json") -Destination (Join-Path $Dist "config.example.json") -Force
Copy-Item -Path (Join-Path $ScriptsDir "install.ps1") -Destination (Join-Path $Dist "install.ps1") -Force
Copy-Item -Path (Join-Path $ScriptsDir "uninstall.ps1") -Destination (Join-Path $Dist "uninstall.ps1") -Force
Copy-Item -Path (Join-Path $ScriptsDir "abrir-porta.ps1") -Destination (Join-Path $Dist "abrir-porta.ps1") -Force
Copy-Item -Path (Join-Path $ScriptsDir "README-INSTALACAO.md") -Destination (Join-Path $Dist "README-INSTALACAO.md") -Force

$zip = Join-Path $Root "replay-server-windows.zip"
if (Test-Path $zip) {
    Remove-Item $zip -Force
}
Compress-Archive -Path (Join-Path $Dist "*") -DestinationPath $zip -Force

Write-Host ""
Write-Host "Pacote gerado:"
Write-Host "  pasta: $Dist"
Write-Host "  zip:   $zip"
Write-Host ""
Write-Host "No Mini PC: extraia o zip, PowerShell como Admin, .\install.ps1"
Write-Host "Depois edite C:\ReplayServer\config.json"
