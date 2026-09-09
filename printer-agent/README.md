# AtendeAI Printer Agent

Agente local para buscar trabalhos de impressão da VPS. O modo padrão e `virtual`, que gera comprovantes `.txt` em `printer-agent/output` para testes sem impressora.

## Testar sem impressora

Na raiz do projeto:

```powershell
node printer-agent/agent.js --test
```

## Executar conectado ao backend

```powershell
$env:ATENDEAI_API_URL = "https://seu-dominio.com"
$env:ATENDEAI_PRINT_MODE = "virtual"
node printer-agent/agent.js
```

O agente consulta `/api/print-jobs` a cada 5 segundos, processa os trabalhos e atualiza o status para `printed` ou `failed`.

## Windows

O processo pode ser executado com Node.js 22 LTS. Para uso contínuo, ele deve ser registrado no Agendador de Tarefas do Windows ou empacotado em um instalador `.exe` na próxima etapa.

O modo físico será conectado por um adaptador ESC/POS, sem alterar a fila nem o formato dos pedidos.

## Impressora ESC/POS de rede

Quando tiver uma impressora térmica com IP na mesma rede do computador:

```powershell
$env:ATENDEAI_API_URL = "https://seu-dominio.com"
$env:ATENDEAI_PRINT_MODE = "escpos"
$env:PRINTER_HOST = "192.168.1.50"
$env:PRINTER_PORT = "9100"
node printer-agent/agent.js
```

O adaptador envia o texto em ASCII, inicializa a impressora e solicita o corte do papel. Impressoras USB dependem do driver do Windows e serão ligadas em uma etapa específica do instalador.
