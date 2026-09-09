$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot

if (-not (Test-Path 'dist\AtendeAI-Printer-Agent.exe')) {
  npm.cmd install
  npm.cmd run build:windows
}

$compiler = Get-Command iscc.exe -ErrorAction SilentlyContinue
if (-not $compiler) {
  throw 'Inno Setup nao encontrado. Instale pelo site https://jrsoftware.org/isinfo.php e rode novamente.'
}

& $compiler.Source 'installer.iss'
Write-Host "Instalador criado em $PSScriptRoot\dist\installer\AtendeAI-Printer-Agent-Setup.exe"