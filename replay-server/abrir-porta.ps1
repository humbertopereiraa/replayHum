#Requires -RunAsAdministrator
<#
.SYNOPSIS
  Libera a porta 8080 no Firewall do Windows para a botoeira ESP32 alcançar o Mini PC.
#>
[CmdletBinding()]
param(
    [int]$Port = 8080
)

$ErrorActionPreference = "Stop"
$regra = "ReplayServer $Port"

netsh advfirewall firewall delete rule name=$regra 2>$null | Out-Null
netsh advfirewall firewall add rule name=$regra dir=in action=allow protocol=TCP localport=$Port profile=any
if ($LASTEXITCODE -ne 0) {
    Write-Error "Falha ao criar a regra de firewall."
    exit $LASTEXITCODE
}

Write-Host "Porta $Port liberada (regra '$regra')."
Write-Host "A botoeira deve apontar para o IPv4 deste PC (ipconfig), nao localhost."
Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
    Where-Object { $_.IPAddress -notlike "127.*" -and $_.PrefixOrigin -ne "WellKnown" } |
    Select-Object -ExpandProperty IPAddress |
    ForEach-Object { Write-Host "  IPv4: $_" }
