$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot

# O terminal do VS Code as vezes tem um PATH antigo sem o Node: garante o caminho padrao.
foreach ($nodeDir in @("$env:ProgramFiles\nodejs", "${env:ProgramFiles(x86)}\nodejs")) {
  if ((Test-Path "$nodeDir\node.exe") -and ($env:PATH -notlike "*$nodeDir*")) {
    $env:PATH = "$nodeDir;$env:PATH"
  }
}

New-Item -ItemType Directory -Force -Path dist | Out-Null

Write-Host 'Instalando dependencias...'
& npm.cmd install --no-audit --no-fund

Write-Host 'Gerando o icone do aplicativo...'
& powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot 'gerar-icone.ps1')

# O pkg nao sabe embutir icone e aplicar depois corrompe o payload. Entao o icone
# vai no binario base do Node, e o pkg usa esse binario via PKG_NODE_PATH.
Write-Host 'Preparando o binario base com o icone...'
& powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot 'preparar-node-icone.ps1')

$binarioBase = Get-ChildItem (Join-Path $PSScriptRoot '.pkg-node') -File |
  Where-Object { $_.Name -notlike '*.bak' -and $_.Length -gt 10MB } |
  Sort-Object LastWriteTime -Descending | Select-Object -First 1
if (-not $binarioBase) { throw 'Binario base do pkg nao foi preparado.' }
$env:PKG_NODE_PATH = $binarioBase.FullName
Write-Host "Usando binario base: $env:PKG_NODE_PATH"

Write-Host 'Empacotando o agente com o pkg...'
& npm.cmd run build:windows

Write-Host 'Conferindo o executavel gerado...'
& powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot 'aplicar-icone-exe.ps1')

if (-not (Test-Path dist\config.json)) { Copy-Item config.sample.json dist\config.json -Force }

$exe = Get-Item 'dist\AtendePrint.exe'
Write-Host ("Executavel pronto: {0} ({1:N1} MB)" -f $exe.FullName, ($exe.Length / 1MB))