#Requires -RunAsAdministrator
<#
.SYNOPSIS
  Instala o replay-server em C:\ReplayServer e registra a tarefa de boot.
#>
[CmdletBinding()]
param(
    [string]$InstallDir = "C:\ReplayServer"
)

$ErrorActionPreference = "Stop"
$TaskName = "ReplayServer"
$SourceDir = $PSScriptRoot

function Test-IsAdmin {
    $id = [Security.Principal.WindowsIdentity]::GetCurrent()
    $p = New-Object Security.Principal.WindowsPrincipal($id)
    return $p.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

if (-not (Test-IsAdmin)) {
    Write-Error "Execute este script como Administrador."
    exit 1
}

$exeSrc = Join-Path $SourceDir "replay-server.exe"
if (-not (Test-Path $exeSrc)) {
    Write-Error "replay-server.exe nao encontrado em $SourceDir. Rode build-windows.ps1 antes, ou extraia o pacote completo."
    exit 1
}

$ffmpegSrc = Join-Path $SourceDir "ffmpeg.exe"
if (-not (Test-Path $ffmpegSrc)) {
    $ffmpegSrc = Join-Path $SourceDir "ffmpeg\ffmpeg.exe"
}
if (-not (Test-Path $ffmpegSrc)) {
    Write-Error "ffmpeg.exe nao encontrado em $SourceDir. O pacote do cliente precisa incluir o FFmpeg."
    exit 1
}

function Copy-IfDifferent {
    param([string]$Src, [string]$Dest)
    if (-not (Test-Path $Src)) { return }
    $srcFull = [System.IO.Path]::GetFullPath($Src)
    $destFull = [System.IO.Path]::GetFullPath($Dest)
    if ($srcFull -eq $destFull) { return }
    $destDir = Split-Path $Dest -Parent
    if (-not (Test-Path $destDir)) {
        New-Item -ItemType Directory -Force -Path $destDir | Out-Null
    }
    Copy-Item -Path $Src -Destination $Dest -Force
}

Write-Host "Parando tarefa existente (se houver)..."
if (Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue) {
    Stop-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
}

Get-Process -Name "replay-server" -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
Start-Sleep -Seconds 1

New-Item -ItemType Directory -Force -Path $InstallDir | Out-Null

$arquivos = @(
    "replay-server.exe",
    "config.example.json",
    "README-INSTALACAO.md",
    "install.ps1",
    "uninstall.ps1",
    "abrir-porta.ps1"
)
foreach ($nome in $arquivos) {
    Copy-IfDifferent (Join-Path $SourceDir $nome) (Join-Path $InstallDir $nome)
}

Copy-IfDifferent $ffmpegSrc (Join-Path $InstallDir "ffmpeg.exe")
Get-ChildItem -Path (Split-Path $ffmpegSrc -Parent) -Filter "*.dll" -ErrorAction SilentlyContinue | ForEach-Object {
    Copy-IfDifferent $_.FullName (Join-Path $InstallDir $_.Name)
}

$configDest = Join-Path $InstallDir "config.json"
if (-not (Test-Path $configDest)) {
    $configSrc = Join-Path $SourceDir "config.json"
    if (-not (Test-Path $configSrc)) {
        $configSrc = Join-Path $SourceDir "config.example.json"
    }
    if (-not (Test-Path $configSrc)) {
        $configSrc = Join-Path $InstallDir "config.example.json"
    }
    Copy-Item -Path $configSrc -Destination $configDest
    Write-Host "config.json criado a partir do modelo. Edite $configDest antes de usar em producao."
} else {
    Write-Host "config.json existente preservado em $configDest"
}

$exeDest = Join-Path $InstallDir "replay-server.exe"
$action = New-ScheduledTaskAction -Execute $exeDest -WorkingDirectory $InstallDir
$trigger = New-ScheduledTaskTrigger -AtStartup
$principal = New-ScheduledTaskPrincipal -UserId "SYSTEM" -LogonType ServiceAccount -RunLevel Highest
$settings = New-ScheduledTaskSettingsSet `
    -AllowStartIfOnBatteries `
    -DontStopIfGoingOnBatteries `
    -RestartCount 3 `
    -RestartInterval (New-TimeSpan -Minutes 1) `
    -ExecutionTimeLimit ([TimeSpan]::Zero) `
    -Hidden `
    -StartWhenAvailable `
    -MultipleInstances IgnoreNew

Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Principal $principal -Settings $settings -Force | Out-Null
Start-ScheduledTask -TaskName $TaskName

$regra = "ReplayServer 8080"
netsh advfirewall firewall delete rule name=$regra 2>$null | Out-Null
netsh advfirewall firewall add rule name=$regra dir=in action=allow protocol=TCP localport=8080 profile=any | Out-Null
Write-Host "Firewall: porta 8080 liberada para a botoeira na LAN."

Write-Host ""
Write-Host "Instalado em $InstallDir"
Write-Host "Tarefa agendada '$TaskName' registrada (sobe com o Windows)."
Write-Host "Edite $configDest e depois: schtasks /End /TN $TaskName ; schtasks /Run /TN $TaskName"
Write-Host "Saude: http://localhost:8080/health"
Write-Host "Log:   $(Join-Path $InstallDir 'replay-server.log')"
Write-Host "Botoeira: no portal, use o IPv4 DESTE PC (ipconfig), porta 8080, o mesmo replay_token. Nao use localhost."
