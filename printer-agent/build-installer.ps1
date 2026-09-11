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

if (-not (Test-Path 'dist\AtendePrint.exe')) {
  Write-Host 'Gerando o executavel do agente com o pkg...'
  # O npm pode nao existir (Node portatil): nesse caso as dependencias ja estao instaladas.
  $npm = Get-Command npm.cmd -ErrorAction SilentlyContinue
  if ($npm) {
    & $npm.Source install --no-audit --no-fund
  } elseif (Test-Path 'node_modules') {
    Write-Host 'npm nao encontrado: usando as dependencias ja instaladas.'
  } else {
    throw 'npm nao encontrado e node_modules nao existe. Instale o Node.js (que inclui o npm).'
  }
  # O build-windows.ps1 cuida do icone, do binario base com PKG_NODE_PATH e do empacotamento.
  & powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot 'build-windows.ps1')
}

$compiler = Get-Command iscc.exe -ErrorAction SilentlyContinue
if ($compiler) { $compilerPath = $compiler.Source }
if (-not $compiler) {
  $compilerPath = @(
    "$env:ProgramFiles\Inno Setup 7\ISCC.exe",
    "$env:ProgramFiles\Inno Setup 6\ISCC.exe",
    "${env:ProgramFiles(x86)}\Inno Setup 7\ISCC.exe",
    "${env:ProgramFiles(x86)}\Inno Setup 6\ISCC.exe"
  ) | Where-Object { Test-Path $_ } | Select-Object -First 1
}
if (-not $compilerPath) {
  throw 'Inno Setup nao encontrado. Instale pelo site https://jrsoftware.org/isinfo.php e rode novamente.'
}

& $compilerPath 'installer.iss'

$setup = Get-ChildItem 'dist\installer\AtendePrint-Setup*.exe' -ErrorAction SilentlyContinue |
  Sort-Object LastWriteTime -Descending | Select-Object -First 1
if ($setup) {
  Write-Host ''
  Write-Host "Instalador criado: $($setup.FullName)"
  Write-Host ("Tamanho: {0:N1} MB" -f ($setup.Length / 1MB))
} else {
  Write-Host 'A compilacao terminou, mas o instalador nao foi encontrado em dist\installer.'
}