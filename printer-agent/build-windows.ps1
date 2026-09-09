$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot

New-Item -ItemType Directory -Force -Path dist | Out-Null
npm.cmd install
npm.cmd run build:windows
Copy-Item config.sample.json dist/config.json -Force
Write-Host "Executavel criado em $PSScriptRoot\dist\AtendeAI-Printer-Agent.exe"