# Inicia o agente de impressao (fica rodando e imprime os pedidos do painel).
# Para parar: feche a janela ou finalize o processo node.exe.
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
$log = Join-Path $PSScriptRoot 'agent.log'
Set-Location $raiz

Write-Host "AtendeAI Printer Agent iniciando..." -ForegroundColor Cyan
Write-Host "Node: $node"
Write-Host "Config: $PSScriptRoot\config.json"
Write-Host "Log: $log"
Write-Host 'Pressione Ctrl+C para parar.'
Write-Host ''

& cmd /c "`"$node`" printer-agent\agent.js 2>&1" | ForEach-Object { $_ | Out-File -FilePath $log -Append -Encoding utf8 }
