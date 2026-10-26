#Requires -RunAsAdministrator
<#
.SYNOPSIS
  Remove a tarefa de boot do replay-server. Com -RemoveData apaga buffer, replays e logs.
#>
[CmdletBinding()]
param(
    [string]$InstallDir = "C:\ReplayServer",
    [switch]$RemoveData
)

$ErrorActionPreference = "Stop"
$TaskName = "ReplayServer"

function Test-IsAdmin {
    $id = [Security.Principal.WindowsIdentity]::GetCurrent()
    $p = New-Object Security.Principal.WindowsPrincipal($id)
    return $p.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

if (-not (Test-IsAdmin)) {
    Write-Error "Execute este script como Administrador."
    exit 1
}

if (Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue) {
    Stop-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
    Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
    Write-Host "Tarefa agendada '$TaskName' removida."
} else {
    Write-Host "Tarefa agendada '$TaskName' nao existia."
}

Get-Process -Name "replay-server" -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue

netsh advfirewall firewall delete rule name="ReplayServer 8080" 2>$null | Out-Null

if ($RemoveData) {
    foreach ($nome in @("buffer", "replays", "replay-server.log", "replay-server.log.old", "botoeira_ultimo_sinal.log")) {
        $path = Join-Path $InstallDir $nome
        if (Test-Path $path) {
            Remove-Item -Path $path -Recurse -Force
            Write-Host "Removido $path"
        }
    }
    Write-Host "config.json foi preservado em $(Join-Path $InstallDir 'config.json')"
} else {
    Write-Host "Arquivos em $InstallDir foram mantidos (incluindo config.json)."
    Write-Host "Para apagar buffer/replays/logs: .\uninstall.ps1 -RemoveData"
}
