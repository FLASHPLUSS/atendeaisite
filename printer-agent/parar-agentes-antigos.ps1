# Encerra agentes de impressao antigos e remove a tarefa agendada criada quando o
# agente rodava direto da pasta do projeto (printer-agent/iniciar-agente.ps1).
# Sem isso, dois agentes ficariam disputando a mesma fila de impressao.
# Este script e chamado automaticamente pelo instalador.

$removido = $false

# 1) Remove a tarefa agendada do Windows, se existir.
$tarefa = Get-ScheduledTask -TaskName 'AtendeAI Printer Agent' -ErrorAction SilentlyContinue
if ($tarefa) {
  Stop-ScheduledTask -TaskName 'AtendeAI Printer Agent' -ErrorAction SilentlyContinue
  Unregister-ScheduledTask -TaskName 'AtendeAI Printer Agent' -Confirm:$false -ErrorAction SilentlyContinue
  Write-Host 'Tarefa agendada "AtendeAI Printer Agent" removida.'
  $removido = $true
}

# 2) Encerra agentes rodando via Node (a partir do repositorio).
$nodeAgentes = Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" -ErrorAction SilentlyContinue |
  Where-Object { $_.CommandLine -like '*printer-agent*agent.js*' }
foreach ($processo in $nodeAgentes) {
  Stop-Process -Id $processo.ProcessId -Force -ErrorAction SilentlyContinue
  Write-Host "Agente via Node encerrado (PID $($processo.ProcessId))."
  $removido = $true
}

# 3) Encerra agentes ja instalados (executavel), para liberar o arquivo na atualizacao.
$exeAgentes = Get-Process -Name 'AtendeAI-Printer-Agent' -ErrorAction SilentlyContinue
foreach ($processo in $exeAgentes) {
  Stop-Process -Id $processo.Id -Force -ErrorAction SilentlyContinue
  Write-Host "Agente instalado encerrado (PID $($processo.Id))."
  $removido = $true
}

if (-not $removido) { Write-Host 'Nenhum agente antigo encontrado.' }
