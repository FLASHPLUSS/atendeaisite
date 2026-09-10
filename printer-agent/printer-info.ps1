# Diagnostico da impressao no Windows: use quando nada sai na impressora.
# Nao precisa de Node.js.
$nomeAlvo = if ($args.Count -gt 0) { $args[0] } else { '' }

Write-Host '=== SERVICO DE IMPRESSAO (SPOOLER) ===' -ForegroundColor Cyan
$spooler = Get-Service -Name Spooler -ErrorAction SilentlyContinue
if ($spooler) {
  $cor = if ($spooler.Status -eq 'Running') { 'Green' } else { 'Red' }
  Write-Host "Status: $($spooler.Status) | Inicio: $($spooler.StartType)" -ForegroundColor $cor
  if ($spooler.Status -ne 'Running') {
    Write-Host 'O Spooler esta parado: nada imprime neste PC.' -ForegroundColor Yellow
    Write-Host 'Rode em um PowerShell COMO ADMINISTRADOR: Start-Service Spooler' -ForegroundColor Yellow
  }
} else {
  Write-Host 'Servico Spooler NAO ENCONTRADO.' -ForegroundColor Red
}

if ($spooler -and $spooler.Status -ne 'Running') { exit 1 }

Write-Host ''
Write-Host '=== IMPRESSORAS INSTALADAS ===' -ForegroundColor Cyan
Get-Printer | ForEach-Object {
  Write-Host ("  {0}  (driver: {1} | porta: {2} | status: {3} | na fila: {4})" -f $_.Name, $_.DriverName, $_.PortName, $_.PrinterStatus, $_.JobCount)
}

Write-Host ''
Write-Host '=== PORTAS DE IMPRESSAO ===' -ForegroundColor Cyan
Get-PrinterPort | ForEach-Object { Write-Host ("  {0}  ({1} / {2})" -f $_.Name, $_.Description, $_.PortMonitor) }

if ($nomeAlvo) {
  Write-Host ''
  Write-Host "=== FILA DE $nomeAlvo ===" -ForegroundColor Cyan
  $trabalhos = @(Get-PrintJob -PrinterName $nomeAlvo -ErrorAction SilentlyContinue)
  if ($trabalhos.Count -eq 0) {
    Write-Host '  (fila vazia - os trabalhos foram entregues a impressora)'
  } else {
    $trabalhos | ForEach-Object { Write-Host ("  #{0} {1} - {2} - {3} paginas" -f $_.Id, $_.DocumentName, $_.JobStatus, $_.TotalPages) }
    Write-Host '  Fila com itens presos: verifique se a impressora esta ligada e com papel.' -ForegroundColor Yellow
  }
}
