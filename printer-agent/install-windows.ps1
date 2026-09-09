param(
  [string]$ApiUrl = 'https://seu-dominio.com',
  [ValidateSet('virtual', 'escpos')][string]$Mode = 'virtual',
  [string]$PrinterHost = '',
  [int]$PrinterPort = 9100,
  [int]$PollSeconds = 5
)

$ErrorActionPreference = 'Stop'
$installDirectory = Join-Path $env:LOCALAPPDATA 'AtendeAI\PrinterAgent'
New-Item -ItemType Directory -Force -Path $installDirectory | Out-Null
Copy-Item (Join-Path $PSScriptRoot 'dist\AtendeAI-Printer-Agent.exe') (Join-Path $installDirectory 'AtendeAI-Printer-Agent.exe') -Force
New-Item -ItemType Directory -Force -Path (Join-Path $installDirectory 'output') | Out-Null
@{
  apiUrl = $ApiUrl
  mode = $Mode
  pollSeconds = $PollSeconds
  printerHost = $PrinterHost
  printerPort = $PrinterPort
} | ConvertTo-Json | Set-Content (Join-Path $installDirectory 'config.json') -Encoding UTF8

$taskName = 'AtendeAI Printer Agent'
$action = New-ScheduledTaskAction -Execute (Join-Path $installDirectory 'AtendeAI-Printer-Agent.exe') -WorkingDirectory $installDirectory
$trigger = New-ScheduledTaskTrigger -AtLogOn
$principal = New-ScheduledTaskPrincipal -UserId $env:USERNAME -LogonType Interactive -RunLevel Limited
Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Principal $principal -Force | Out-Null
Start-ScheduledTask -TaskName $taskName
Write-Host "Agente instalado e iniciado em $installDirectory"