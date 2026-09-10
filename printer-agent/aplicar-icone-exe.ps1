# Verifica o executavel AtendePrint.exe gerado pelo pkg.
#
# IMPORTANTE: o icone NAO e aplicado aqui. Aplicar icone DEPOIS do empacotamento
# (rcedit/resedit) destroi o overlay que o pkg anexa no fim do arquivo e o .exe
# deixa de abrir ("Pkg: Error reading from file"). O icone e embutido ANTES do
# empacotamento, no binario base do Node, por preparar-node-icone.ps1.
param(
  [string]$Exe = (Join-Path $PSScriptRoot 'dist\AtendePrint.exe'),
  [string]$Ico = (Join-Path $PSScriptRoot 'assets\AtendePrint.ico'),
  [string]$Versao = '2.0.0'
)

$ErrorActionPreference = 'Stop'

if (-not (Test-Path $Exe)) { throw "Executavel nao encontrado: $Exe. Rode 'npm run build:windows' antes." }

$item = Get-Item $Exe
$fvi = $item.VersionInfo

Write-Host "Executavel : $($item.FullName)"
Write-Host ("Tamanho    : {0:N1} MB" -f ($item.Length / 1MB))
Write-Host "ProductName: $($fvi.ProductName)"
Write-Host "Descricao  : $($fvi.FileDescription)"
Write-Host "Empresa    : $($fvi.CompanyName)"
Write-Host "Versao     : $($fvi.FileVersion)"

Add-Type -AssemblyName System.Drawing
$icone = [System.Drawing.Icon]::ExtractAssociatedIcon($item.FullName)
if ($icone) { Write-Host ("Icone      : {0}x{1}" -f $icone.Width, $icone.Height) }
