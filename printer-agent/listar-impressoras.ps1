# Usado pelo instalador (installer.iss) para descobrir as impressoras instaladas
# neste PC e montar a lista de escolha no assistente.
# Grava um nome por linha no arquivo informado em -OutFile.
param(
  [Parameter(Mandatory = $true)][string]$OutFile
)

$impressoras = @()
try { $impressoras = @(Get-Printer -ErrorAction Stop | Select-Object -ExpandProperty Name) } catch { }
if ($impressoras.Count -eq 0) {
  try {
    $impressoras = @(
      Get-CimInstance -ClassName Win32_Printer -ErrorAction Stop |
        Where-Object { -not $_.Network } |
        Select-Object -ExpandProperty Name
    )
  } catch { }
}

# Descarta destinos virtuais que nunca devem imprimir cupom.
$ignorar = @('Microsoft Print to PDF', 'Microsoft XPS Document Writer', 'Fax', 'OneNote')
$impressoras = @($impressoras | Where-Object { $ignorar -notcontains $_ })

# UTF8Encoding($false) evita BOM, que quebraria a leitura no instalador.
[System.IO.File]::WriteAllLines($OutFile, [string[]]$impressoras, (New-Object System.Text.UTF8Encoding($false)))
