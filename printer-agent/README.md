# AtendeAI Printer Agent

Agente local que busca os pedidos na fila da plataforma e imprime no computador do restaurante.
Ele roda **no PC onde a impressora está ligada** (USB) ou na mesma rede dela (ESC/POS).

## Modos de impressão

| Modo | Para que serve | O que precisa |
| --- | --- | --- |
| `virtual` | Testar sem impressora | Nada, salva `.txt` em `output/` |
| `usb` | Impressora térmica ligada por **USB** no PC | O nome da impressora no Windows |
| `escpos` | Impressora térmica de rede | IP/hostname e porta (normalmente 9100) |

## Requisitos no PC da impressora

- **Serviço de impressão do Windows (Spooler) em execução.** Se ele estiver parado, o Windows não imprime nada
  e o agente não enxerga nenhuma impressora. Para ligar, abra um PowerShell **como Administrador**:

  ```powershell
  Start-Service Spooler
  Set-Service Spooler -StartupType Automatic
  ```

- **Node.js 18 ou superior** apenas se você for rodar pelo código-fonte (`node agent.js`).
  Usando o `AtendeAI-Printer-Agent.exe`, o Node não é necessário.

## Passo a passo do modo USB

1. Instale a impressora no Windows (Configurações > Bluetooth e dispositivos > Impressoras e scanners) e confirme que ela aparece lá, ligada e sem erro.
2. Descubra o **nome exato** dela:

   ```powershell
   node printer-agent/agent.js --list-printers
   ```

   Se estiver usando o executável instalado:

   ```powershell
   & "$env:LOCALAPPDATA\AtendeAI\PrinterAgent\AtendeAI-Printer-Agent.exe" --list-printers
   ```

   E sem Node.js instalado:

   ```powershell
   powershell -NoProfile -ExecutionPolicy Bypass -File printer-agent/list-printers.ps1
   ```

3. Crie ou edite o `config.json` ao lado do executável (ou em `printer-agent/config.json` se rodar pelo Node):

   ```json
   {
     "apiUrl": "https://www.anota.ai.venusdev.xyz",
     "mode": "usb",
     "printerName": "NOME EXATO DA IMPRESSORA",
     "columns": 42,
     "pollSeconds": 5
   }
   ```

   - `columns`: `42` para papel de 80 mm e `32` para 58 mm.
   - O nome precisa ser idêntico ao que aparece em Impressoras e scanners (maiúsculas, espaços e acentos contam).

4. Teste a impressão direto no PC, sem depender da plataforma:

   ```powershell
   node printer-agent/agent.js --test
   ```

5. Se o cupom saiu, inicie o agente:

   ```powershell
   node printer-agent/agent.js
   ```

## Testar sem impressora

Com `"mode": "virtual"` no `config.json`:

```powershell
node printer-agent/agent.js --test
```

Os cupons são gravados em `printer-agent/output/pedido-*.txt`.

## Executar conectado ao backend

```powershell
$env:ATENDEAI_API_URL = "https://seu-dominio.com"
$env:ATENDEAI_PRINT_MODE = "usb"
$env:PRINTER_NAME = "Elgin i9"
node printer-agent/agent.js
```

O agente consulta `/api/print-jobs` a cada 5 segundos, imprime e atualiza o status para `printed` ou `failed`.
A configuração salva no painel (`/api/printer-config`) só preenche o que **não** estiver definido no
`config.json` ou em variáveis de ambiente — o hardware é sempre decidido no PC.

> Se aparecer `A VPS está com uma versão antiga e ainda não possui as rotas de impressão`, o servidor
> publicado ainda não tem o `server.js` atualizado. Publique a versão atual para que o modo/impressora
> salvos no painel cheguem ao agente. Nada quebra: o agente continua usando o `config.json` local.

> `GET /api/print-jobs` **consome** a fila (marca `pending` → `printing`). Não chame esse endereço
> manualmente com o agente ligado, senão o pedido fica preso e só volta para a fila depois de 10 minutos.

## Scripts prontos (Windows)

| Script | Para que serve |
| --- | --- |
| `instalar-inicio-automatico.ps1` | Cria a tarefa agendada **AtendeAI Printer Agent**, que sobe o agente a cada logon do Windows. Não precisa de administrador. |
| `iniciar-agente.ps1` | Roda o agente em primeiro plano gravando tudo em `printer-agent/agent.log` (UTF-8). |
| `enviar-teste.ps1` | Cria um pedido de teste na plataforma para conferir a impressão de ponta a ponta. |
| `list-printers.ps1` | Lista os nomes exatos das impressoras do Windows (não precisa de Node.js). |
| `listar-impressoras.ps1` | Igual ao anterior, mas grava o resultado em um arquivo (`-OutFile`). É o que o instalador usa para montar a lista de impressoras. |
| `parar-agentes-antigos.ps1` | Remove a tarefa agendada antiga e encerra agentes que rodavam pela pasta do projeto, evitando dois agentes na mesma fila. |
| `printer-info.ps1` | Diagnóstico: serviço de spooler, impressoras, portas e fila de impressão. |

Uso típico:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File printer-agent/instalar-inicio-automatico.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File printer-agent/enviar-teste.ps1
```

Para parar/remover o início automático:

```powershell
Stop-ScheduledTask -TaskName 'AtendeAI Printer Agent'
Unregister-ScheduledTask -TaskName 'AtendeAI Printer Agent' -Confirm:$false
```

## Variáveis de ambiente

| Variável | Padrão | Descrição |
| --- | --- | --- |
| `ATENDEAI_API_URL` | `http://localhost:3000` | URL da plataforma |
| `ATENDEAI_PRINT_MODE` | `virtual` | `virtual`, `usb` ou `escpos` |
| `PRINTER_NAME` | vazio | Nome da impressora do Windows (modo `usb`) |
| `PRINTER_HOST` | vazio | IP/hostname (modo `escpos`) |
| `PRINTER_PORT` | `9100` | Porta (modo `escpos`) |
| `PRINTER_COLUMNS` | `42` | Colunas do cupom (42 = 80 mm, 32 = 58 mm) |
| `ATENDEAI_POLL_MS` | `5000` | Intervalo de busca em milissegundos |

## Como o modo USB funciona

O agente monta o cupom em ESC/POS (bytes crus) e envia direto ao spooler do Windows
(`winspool.drv` → `WritePrinter` com tipo `RAW`) através do `powershell.exe`. Ele não usa
`Out-Printer` nem renderização de texto, por isso o corte de papel e a formatação saem corretos.

Não é preciso instalar nenhum módulo nativo do Node. Os acentos são removidos automaticamente
porque impressoras térmicas usam codepages fixas (CP437/CP850) e não entendem UTF-8.

## Instalador `.exe` (recomendado para o cliente)

O instalador é a forma mais simples: ele já leva dentro de si o executável do agente, **não precisa de
Node.js** e **não depende da pasta do projeto** no computador do restaurante.

Para gerar:

```powershell
Set-Location printer-agent
./build-installer.ps1
```

> Se aparecer *"a execução de scripts foi desabilitada neste sistema"*, rode liberando apenas esta janela
> (não muda nada no Windows de forma permanente):
>
> ```powershell
> Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
> ```
>
> Ou chame direto, sem mexer em configuração nenhuma:
>
> ```powershell
> powershell -NoProfile -ExecutionPolicy Bypass -File printer-agent\build-installer.ps1
> ```

O script instala as dependências, compila o agente com o `pkg` (se ainda não existir) e roda o
Inno Setup. O arquivo final fica em:

```
printer-agent/dist/installer/AtendeAI-Printer-Agent-Setup-v2.0.0.exe
```

### O que o assistente faz

1. **Conexão** – pede a URL da plataforma (já vem preenchida com o endereço atual).
2. **Modo de impressão** – `Virtual`, `ESC/POS por rede` ou `USB / Windows` (já vem marcado USB).
3. **Impressora** – lê as impressoras instaladas neste PC e mostra uma **lista para escolher**,
   em vez de obrigar o usuário a digitar o nome exato (era aí que a impressão quebrava antes).
   Esta tela só aparece no modo USB.
4. **Rede e formato** – IP/hostname (só no modo rede), porta, largura do cupom (`42` = 80 mm,
   `32` = 58 mm) e o intervalo de busca em segundos.

Ao concluir, o instalador:

- encerra um agente que já esteja aberto (`taskkill`);
- copia o `AtendeAI-Printer-Agent.exe` e o `parar-agentes-antigos.ps1` para
  `%LOCALAPPDATA%\AtendeAI\PrinterAgent` (não precisa de administrador);
- grava o `config.json` na mesma pasta com as respostas do assistente;
- roda `parar-agentes-antigos.ps1`, que remove a antiga **tarefa agendada** e encerra agentes
  iniciados a partir da pasta do projeto — isso evita **dois agentes disputando a mesma fila**;
- cria o atalho de inicialização automática e já abre o agente.

### Onde ficam as coisas depois de instalado

| Item | Caminho |
| --- | --- |
| Executável e `config.json` | `%LOCALAPPDATA%\AtendeAI\PrinterAgent` |
| Cupons do modo `virtual` | `%LOCALAPPDATA%\AtendeAI\PrinterAgent\output` |
| Início automático | atalho em `shell:startup` |
| Desinstalar | "Aplicativos instalados" do Windows → **AtendeAI Printer Agent** |

Para diagnosticar depois de instalado, sem depender de Node.js:

```powershell
& "$env:LOCALAPPDATA\AtendeAI\PrinterAgent\AtendeAI-Printer-Agent.exe" --list-printers
& "$env:LOCALAPPDATA\AtendeAI\PrinterAgent\AtendeAI-Printer-Agent.exe" --test
```

### Gerar só o executável (sem instalador)

```powershell
Set-Location printer-agent
npm.cmd install
npm.cmd run build:windows
```

O arquivo será `printer-agent/dist/AtendeAI-Printer-Agent.exe`. Coloque o `config.json` ao lado dele
(o `build-windows.ps1` copia o `config.sample.json` apenas se o `config.json` ainda não existir).

Alternativa sem instalador:

```powershell
./install-windows.ps1 -Mode usb -PrinterName "Elgin i9" -Columns 42
```

## Problemas comuns

| Sintoma | Causa provável |
| --- | --- |
| `O servico de impressao do Windows (Spooler) esta parado` | O serviço `Spooler` está parado — rode `Start-Service Spooler` em um PowerShell como Administrador |
| `--list-printers` não mostra nenhuma impressora | Serviço `Spooler` parado ou nenhuma impressora instalada no Windows |
| Nada imprime e o log mostra `usando http://localhost:3000` | `config.json` ausente ou inválido ao lado do executável |
| `Nao foi possivel abrir a impressora 'X'` | Nome diferente do registrado no Windows, ou impressora desligada |
| O agente grava arquivos `.txt` | `mode` está como `virtual` |
| Cupom cortado nas laterais | `columns` incompatível com a largura do papel |
| Pedido ficou "Imprimindo" e sumiu da fila | O agente devolve o pedido para a fila depois de 10 minutos |
