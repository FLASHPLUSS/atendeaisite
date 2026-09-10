# Lista as impressoras instaladas no Windows e mostra o servico de spooler.
# Nao precisa de Node.js: use este script para descobrir o nome exato da
# impressora que deve ir no campo "printerName" do config.json.
$spooler = Get-Service -Name Spooler -ErrorAction SilentlyContinue
if ($spooler) {
  Write-Host "Servico de impressao (Spooler): $($spooler.Status) / inicio $($spooler.StartType)"
} else {
  Write-Host 'Servico de impressao (Spooler): NAO ENCONTRADO' -ForegroundColor Red
}

if ($spooler -and $spooler.Status -ne 'Running') {
  Write-Host ''
  Write-Host 'O Spooler esta parado, entao nenhuma impressora fica disponivel.' -ForegroundColor Yellow
  Write-Host 'Abra um PowerShell COMO ADMINISTRADOR e rode:' -ForegroundColor Yellow
  Write-Host '  Start-Service Spooler; Set-Service Spooler -StartupType Automatic' -ForegroundColor Yellow
  exit 1
}

Write-Host ''
Write-Host 'Impressoras instaladas (copie o nome exato para "printerName"):'
$impressoras = @()
try { $impressoras = @(Get-Printer | Select-Object -ExpandProperty Name) } catch { }
if ($impressoras.Count -eq 0) {
  try { $impressoras = @(Get-CimInstance -ClassName Win32_Printer | Where-Object { -not $_.Network } | Select-Object -ExpandProperty Name) } catch { }
}
if ($impressoras.Count -eq 0) {
  Write-Host '  (nenhuma impressora encontrada)' -ForegroundColor Yellow
  exit 1
}
$impressoras | ForEach-Object { Write-Host "  - $_" }
