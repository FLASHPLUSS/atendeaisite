param(
  [string]$ApiUrl = 'https://www.anota.ai.venusdev.xyz',
  [ValidateSet('virtual', 'usb', 'escpos')][string]$Mode = 'usb', [string]$PrinterName = '', [int]$Columns = 42,
  [string]$PrinterHost = '',
  [int]$PrinterPort = 9100,
  [int]$PollSeconds = 5
)

$ErrorActionPreference = 'Stop'
$installDirectory = Join-Path $env:LOCALAPPDATA 'AtendeAI\AtendePrint'
New-Item -ItemType Directory -Force -Path $installDirectory | Out-Null
Copy-Item (Join-Path $PSScriptRoot 'dist\AtendePrint.exe') (Join-Path $installDirectory 'AtendePrint.exe') -Force
New-Item -ItemType Directory -Force -Path (Join-Path $installDirectory 'output') | Out-Null
@{
  apiUrl = $ApiUrl
  mode = $Mode
  printerName = $PrinterName; columns = $Columns; pollSeconds = $PollSeconds
  printerHost = $PrinterHost
  printerPort = $PrinterPort
} | ConvertTo-Json | ForEach-Object { [System.IO.File]::WriteAllText((Join-Path $installDirectory 'config.json'), $_, (New-Object System.Text.UTF8Encoding($false))) }

$taskName = 'AtendePrint'
$action = New-ScheduledTaskAction -Execute (Join-Path $installDirectory 'AtendePrint.exe') -WorkingDirectory $installDirectory
$trigger = New-ScheduledTaskTrigger -AtLogOn
$principal = New-ScheduledTaskPrincipal -UserId $env:USERNAME -LogonType Interactive -RunLevel Limited
Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Principal $principal -Force | Out-Null
Start-ScheduledTask -TaskName $taskName
Write-Host "Agente instalado e iniciado em $installDirectory"; if (-not $PrinterName) { Write-Host ''; Write-Host 'Impressoras instaladas neste Windows:' -ForegroundColor Yellow; Get-Printer | Select-Object -ExpandProperty Name | ForEach-Object { Write-Host "  - $_" }; Write-Host 'Preencha "printerName" no config.json com o nome exato.' -ForegroundColor Yellow }