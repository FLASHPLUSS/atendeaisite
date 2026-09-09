# AtendeAI Printer Agent

Agente local para buscar trabalhos de impressão da VPS. O modo padrão é `virtual`, que gera comprovantes `.txt` em `printer-agent/output` para testes sem impressora.

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

## Impressora ESC/POS de rede

```powershell
$env:ATENDEAI_API_URL = "https://seu-dominio.com"
$env:ATENDEAI_PRINT_MODE = "escpos"
$env:PRINTER_HOST = "192.168.1.50"
$env:PRINTER_PORT = "9100"
node printer-agent/agent.js
```

O adaptador envia o texto em ASCII, inicializa a impressora e solicita o corte do papel. Impressoras USB dependem do driver do Windows e serão ligadas em uma etapa específica do instalador.

## Gerar o executável

```powershell
Set-Location printer-agent
npm.cmd install
npm.cmd run build:windows
Copy-Item config.sample.json dist/config.json
```

O arquivo será `printer-agent/dist/AtendeAI-Printer-Agent.exe`.

## Instalador visual `.exe`

1. Instale o Inno Setup no computador de desenvolvimento: `https://jrsoftware.org/isinfo.php`.
2. Rode `Set-ExecutionPolicy -Scope Process Bypass`.
3. Rode `./build-installer.ps1` dentro de `printer-agent`.

O arquivo final será `dist/installer/AtendeAI-Printer-Agent-Setup.exe`. O instalador pergunta a URL da plataforma, o modo virtual ou ESC/POS, o IP, a porta e cria o início automático no Windows.
