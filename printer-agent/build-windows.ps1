$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot

# O terminal do VS Code as vezes tem um PATH antigo sem o Node: garante o caminho padrao.
# A ultima opcao e o runtime embutido que existe quando o Node nao esta instalado globalmente.
foreach ($nodeDir in @(
  "$env:ProgramFiles\nodejs",
  "${env:ProgramFiles(x86)}\nodejs",
  (Join-Path $env:LOCALAPPDATA 'Programs\nodejs'),
  (Join-Path $env:USERPROFILE '.tizen-extension-platform\server\runtime')
)) {
  if ((Test-Path "$nodeDir\node.exe") -and ($env:PATH -notlike "*$nodeDir*")) {
    $env:PATH = "$nodeDir;$env:PATH"
  }
}

New-Item -ItemType Directory -Force -Path dist | Out-Null

# O npm pode nao existir (Node portatil): nesse caso as dependencias ja estao instaladas.
$npm = Get-Command npm.cmd -ErrorAction SilentlyContinue
if ($npm) {
  Write-Host 'Instalando dependencias...'
  & $npm.Source install --no-audit --no-fund
} elseif (Test-Path 'node_modules') {
  Write-Host 'npm nao encontrado: usando as dependencias ja instaladas.'
} else {
  throw 'npm nao encontrado e node_modules nao existe. Instale o Node.js (que inclui o npm).'
}

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
$pkgBin = Join-Path $PSScriptRoot 'node_modules\@yao-pkg\pkg\lib-es5\bin.js'
if (Test-Path $pkgBin) {
  & node $pkgBin . --targets node22-win-x64 --output 'dist\AtendePrint.exe'
} else {
  & npm.cmd run build:windows
}

Write-Host 'Conferindo o executavel gerado...'
& powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot 'aplicar-icone-exe.ps1')

if (-not (Test-Path dist\config.json)) { Copy-Item config.sample.json dist\config.json -Force }

$exe = Get-Item 'dist\AtendePrint.exe'
Write-Host ("Executavel pronto: {0} ({1:N1} MB)" -f $exe.FullName, ($exe.Length / 1MB))