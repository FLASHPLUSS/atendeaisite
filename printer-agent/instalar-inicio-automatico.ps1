# Coloca o agente de impressao para iniciar junto com o Windows.
# Nao precisa de administrador: cria uma tarefa agendada do usuario atual.
# Para remover depois:
#   Unregister-ScheduledTask -TaskName 'AtendeAI Printer Agent' -Confirm:$false
$ErrorActionPreference = 'Stop'

$script = Join-Path $PSScriptRoot 'iniciar-agente.ps1'
if (-not (Test-Path $script)) { throw "Nao encontrei $script" }

$node = 'C:\Program Files\nodejs\node.exe'
if (-not (Test-Path $node)) {
  $encontrado = Get-Command node -ErrorAction SilentlyContinue
  if ($encontrado) { $node = $encontrado.Source }
}
if (-not (Test-Path $node)) {
  Write-Host 'Node.js nao encontrado. Instale com: winget install OpenJS.NodeJS.LTS' -ForegroundColor Red
  exit 1
}

$raiz = Split-Path $PSScriptRoot -Parent
$nomeTarefa = 'AtendeAI Printer Agent'

$acao = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$script`"" -WorkingDirectory $raiz
$gatilho = New-ScheduledTaskTrigger -AtLogOn
$principal = New-ScheduledTaskPrincipal -UserId $env:USERNAME -LogonType Interactive -RunLevel Limited
$configuracoes = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1) -ExecutionTimeLimit (New-TimeSpan -Days 0)

Register-ScheduledTask -TaskName $nomeTarefa -Action $acao -Trigger $gatilho -Principal $principal -Settings $configuracoes -Force | Out-Null
Start-ScheduledTask -TaskName $nomeTarefa

Write-Host "Tarefa '$nomeTarefa' criada e iniciada - o agente sobe a cada logon do Windows." -ForegroundColor Green
Write-Host "Log do agente: $(Join-Path $PSScriptRoot 'agent.log')"
Write-Host "Para parar agora:   Stop-ScheduledTask -TaskName '$nomeTarefa'"
Write-Host "Para remover:       Unregister-ScheduledTask -TaskName '$nomeTarefa' -Confirm:`$false"
