<#
  Prepara o binario base do Node.js usado pelo pkg com o icone e os metadados do
  AtendePrint.

  Por que isso existe: o pkg nao sabe embutir icone (nao aceita `--icon`). Aplicar
  o icone DEPOIS do empacotamento quebra o executavel, porque ferramentas como
  rcedit/resedit reescrevem a secao de recursos e destroem o overlay que o pkg
  anexa no fim do arquivo (erro: "Pkg: Error reading from file" / payload
  corrompido). A solucao e aplicar o icone no binario base ANTES do empacotamento
  e apontar o pkg para ele via PKG_NODE_PATH (que tambem ignora a checagem de hash).

  Resultado: <printer-agent>\.pkg-node\fetched-<node>-win-x64
#>
param(
  [string]$NodeRange = 'node22',
  [string]$Platforma = 'win',
  [string]$Arquitetura = 'x64'
)

$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot

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

$ico = Join-Path $PSScriptRoot 'assets\AtendePrint.ico'
if (-not (Test-Path $ico)) {
  Write-Host 'Icone nao encontrado: gerando agora...'
  & powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot 'gerar-icone.ps1')
}
if (-not (Test-Path $ico)) { throw "Nao foi possivel gerar o icone em $ico" }

$rcedit = Join-Path $PSScriptRoot 'node_modules\rcedit\bin\rcedit-x64.exe'
if (-not (Test-Path $rcedit)) {
  $rcedit = Join-Path $PSScriptRoot 'node_modules\rcedit\bin\rcedit.exe'
}
if (-not (Test-Path $rcedit)) { throw 'rcedit nao encontrado. Rode: npm install' }

# Cache privado para nao mexer no cache global do pkg (que tem checksum).
$destino = Join-Path $PSScriptRoot '.pkg-node'
New-Item -ItemType Directory -Force -Path $destino | Out-Null

$pkgFetch = Join-Path $PSScriptRoot 'node_modules\@yao-pkg\pkg-fetch\lib-es5\bin.js'
if (-not (Test-Path $pkgFetch)) { throw 'pkg-fetch nao encontrado. Rode: npm install' }

# O pkg-fetch respeita PKG_NODE_PATH; aqui queremos baixar de verdade.
$nodePathAnterior = $env:PKG_NODE_PATH
$env:PKG_NODE_PATH = ''
try {
  # O pkg-fetch baixa o binario base do release oficial (nao e o Node local).
  # Com -o <dir> ele grava <dir>\node-<versao>-<so>-<arch>.
  & node $pkgFetch -n $NodeRange -p $Platforma -a $Arquitetura -o $destino -f | Out-Null
} finally {
  $env:PKG_NODE_PATH = $nodePathAnterior
}

$encontrado = Get-ChildItem $destino -File |
  Where-Object { $_.Name -notlike '*.bak' -and $_.Name -like '*win-x64*' -and $_.Length -gt 10MB } |
  Sort-Object LastWriteTime -Descending | Select-Object -First 1
if (-not $encontrado) { throw "pkg-fetch nao gerou o binario base em $destino" }
$base = $encontrado.FullName

# Guarda um backup intacto e sempre parte dele, para o icone nao ser reaplicado
# varias vezes (o que faria o binario crescer a cada build).
$backup = "$base.bak"
if (Test-Path $backup) {
  Copy-Item $backup $base -Force
} else {
  Copy-Item $base $backup -Force
}

Write-Host "Binario base: $base"
Write-Host 'Aplicando icone e informacoes de versao no binario base...'

& $rcedit $base `
  --set-icon $ico `
  --set-version-string 'ProductName' 'AtendePrint' `
  --set-version-string 'FileDescription' 'AtendePrint - Agente de Impressao' `
  --set-version-string 'CompanyName' 'AtendeAI' `
  --set-version-string 'LegalCopyright' 'AtendeAI' `
  --set-version-string 'OriginalFilename' 'AtendePrint.exe' `
  --set-version-string 'InternalName' 'AtendePrint' `
  --set-file-version '3.0.0.0' `
  --set-product-version '3.0.0.0'
if ($LASTEXITCODE -ne 0) { throw "rcedit falhou com o codigo $LASTEXITCODE" }

$fvi = (Get-Item $base).VersionInfo
Write-Host "Base preparado: $($fvi.ProductName) v$($fvi.FileVersion)"
