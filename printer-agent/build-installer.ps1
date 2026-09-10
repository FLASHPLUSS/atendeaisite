$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot

# O terminal do VS Code as vezes tem um PATH antigo sem o Node: garante o caminho padrao.
foreach ($nodeDir in @("$env:ProgramFiles\nodejs", "${env:ProgramFiles(x86)}\nodejs")) {
  if ((Test-Path "$nodeDir\node.exe") -and ($env:PATH -notlike "*$nodeDir*")) {
    $env:PATH = "$nodeDir;$env:PATH"
  }
}

if (-not (Test-Path 'dist\AtendeAI-Printer-Agent.exe')) {
  Write-Host 'Gerando o executavel do agente com pkg...'
  & npm.cmd install
  & npm.cmd run build:windows
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

$setup = Get-ChildItem 'dist\installer\AtendeAI-Printer-Agent-Setup*.exe' -ErrorAction SilentlyContinue |
  Sort-Object LastWriteTime -Descending | Select-Object -First 1
if ($setup) {
  Write-Host ''
  Write-Host "Instalador criado: $($setup.FullName)"
  Write-Host ("Tamanho: {0:N1} MB" -f ($setup.Length / 1MB))
} else {
  Write-Host 'A compilacao terminou, mas o instalador nao foi encontrado em dist\installer.'
}