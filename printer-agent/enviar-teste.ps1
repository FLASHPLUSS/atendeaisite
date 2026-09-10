# Cria um pedido de teste na fila da plataforma para conferir a impressao.
# Uso: .\enviar-teste.ps1 [-ApiUrl "https://..."]
param(
  [string]$ApiUrl = 'https://www.anota.ai.venusdev.xyz'
)

$numero = "TESTE-$(Get-Date -Format 'HHmmss')"
$pedido = @{
  orderNumber = $numero
  order = @{
    customer = 'Cliente de teste'
    items = @(
      @{ quantity = 2; name = 'X-Burger'; price = 25.00 },
      @{ quantity = 1; name = 'Coca-Cola Lata'; price = 6.50 }
    )
    total = 56.50
    notes = 'Pedido de teste do agente de impressao'
  }
}

try {
  $resposta = Invoke-RestMethod -Uri "$ApiUrl/api/print-jobs" -Method Post -Body ($pedido | ConvertTo-Json -Depth 6) -ContentType 'application/json'
  Write-Host "Pedido de teste #$($resposta.id) criado ($($resposta.order_number))." -ForegroundColor Green
  Write-Host 'Aguarde alguns segundos: o agente busca a cada 5s e imprime.' -ForegroundColor Green
} catch {
  Write-Host "Falha ao criar o pedido: $($_.Exception.Message)" -ForegroundColor Red
  exit 1
}
