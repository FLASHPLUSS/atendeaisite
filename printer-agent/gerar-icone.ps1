# Gera printer-agent/assets/AtendePrint.ico a partir da logo em PNG.
# Um .ico pode conter varias resolucoes; o Windows escolhe a melhor para cada lugar
# (16px na barra de tarefas, 256px no Explorer). Todos entram como PNG, formato
# aceito desde o Windows Vista.
param(
  [string]$PngOrigem = (Join-Path $PSScriptRoot 'assets\AtendePrint-Logo.png'),
  [string]$IcoDestino = (Join-Path $PSScriptRoot 'assets\AtendePrint.ico')
)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

if (-not (Test-Path $PngOrigem)) { throw "Logo nao encontrada: $PngOrigem" }

$tamanhos = @(16, 24, 32, 48, 64, 128, 256)
$origem = [System.Drawing.Image]::FromFile($PngOrigem)
$imagens = @()

foreach ($lado in $tamanhos) {
  $bmp = New-Object System.Drawing.Bitmap($lado, $lado, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
  $g.Clear([System.Drawing.Color]::Transparent)
  $g.DrawImage($origem, 0, 0, $lado, $lado)
  $g.Dispose()

  $ms = New-Object System.IO.MemoryStream
  $bmp.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png)
  $imagens += , @{ Lado = $lado; Dados = $ms.ToArray() }
  $ms.Dispose()
  $bmp.Dispose()
}
$origem.Dispose()

$pastaIco = Split-Path -Parent $IcoDestino
if (-not (Test-Path $pastaIco)) { New-Item -ItemType Directory -Force -Path $pastaIco | Out-Null }

$stream = [System.IO.File]::Create($IcoDestino)
$writer = New-Object System.IO.BinaryWriter($stream)

# Cabecalho ICONDIR: reservado(2) + tipo=1 icone(2) + quantidade(2)
$writer.Write([UInt16]0)
$writer.Write([UInt16]1)
$writer.Write([UInt16]$imagens.Count)

# Cada entrada tem 16 bytes e o offset aponta para depois de todas as entradas.
$offset = 6 + (16 * $imagens.Count)
foreach ($imagem in $imagens) {
  # 256 e gravado como 0 no campo de 1 byte do formato ICO.
  $ladoByte = if ($imagem.Lado -ge 256) { 0 } else { $imagem.Lado }
  $writer.Write([Byte]$ladoByte)
  $writer.Write([Byte]$ladoByte)
  $writer.Write([Byte]0)      # cores da paleta (0 = sem paleta)
  $writer.Write([Byte]0)      # reservado
  $writer.Write([UInt16]1)    # planos
  $writer.Write([UInt16]32)   # bits por pixel
  $writer.Write([UInt32]$imagem.Dados.Length)
  $writer.Write([UInt32]$offset)
  $offset += $imagem.Dados.Length
}

foreach ($imagem in $imagens) { $writer.Write($imagem.Dados) }

$writer.Flush()
$writer.Close()
$stream.Close()

$arquivo = Get-Item $IcoDestino
Write-Host ("Icone gerado: {0} ({1} KB, {2} tamanhos: {3})" -f $arquivo.FullName, [math]::Round($arquivo.Length / 1KB), $imagens.Count, ($tamanhos -join ', '))
