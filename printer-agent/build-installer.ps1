$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot

if (-not (Test-Path 'dist\AtendeAI-Printer-Agent.exe')) {
  npm.cmd install
  npm.cmd run build:windows
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
Write-Host "Instalador criado em $PSScriptRoot\dist\installer\AtendeAI-Printer-Agent-Setup.exe"