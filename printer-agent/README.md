# AtendePrint - Agente de Impressão AtendeAI

Agente local que busca os pedidos na fila da plataforma e imprime no computador do restaurante.
Ele roda **no PC onde a impressora está ligada** (USB) ou na mesma rede dela (ESC/POS).

## O agente não tem tela: quem mostra tudo é o painel

O AtendePrint roda **totalmente oculto**, como serviço em segundo plano no Windows. Não abre janela,
não fica na barra de tarefas e não oferece nenhuma configuração local. Toda a operação acontece na
**tela Impressão do painel web**.

O que o agente faz sozinho, em ciclo:

1. **Descobre as impressoras** instaladas neste Windows (USB e rede), incluindo porta e driver.
2. **Informa o painel** o que encontrou, a cada poucos segundos (`POST /api/printer-agent/report`).
3. **Escolhe sozinho** a impressora USB quando o painel ainda não decidiu — a preferência é sempre
   pela que está em porta USB.
4. **Busca a fila** (`GET /api/print-jobs`), imprime e devolve `printed` ou `failed`.
5. **Rebusca a configuração** do painel a cada ciclo: largura, altura, layout do cupom, impressora e
   intervalo de busca mudam no painel e já valem no próximo papel.

Na tela **Impressão** do painel o usuário encontra:

- a **impressora real** detectada pelo agente na USB, com o estado do agente (online/offline e há
  quanto tempo reportou);
- os campos de **Largura (colunas)** e **Comprimento/altura (linhas)** do cupom;
- o **editor do comprovante**, com marcadores (`{{loja}}`, `{{itens}}`, `{{total}}`...) e
  pré-visualização na largura configurada;
- o botão **Criar pedido de teste**, que valida a comunicação em tempo real.

O **endereço do painel nunca aparece para o usuário final**: o domínio fica somente no `config.json`
do computador e o agente não expõe nenhuma página local.

### Como iniciar

| Ação | Resultado |
| --- | --- |
| Ligar o Windows | O agente sobe sozinho, em segundo plano, e já imprime os pedidos |
| Atalho **AtendePrint** (Área de Trabalho / Menu Iniciar) | Apenas reinicia o agente em segundo plano |
| `AtendePrint.exe` | Igual ao atalho (nunca abre janela) |
| Clicar de novo com o agente ligado | O segundo processo encerra sozinho, sem imprimir em duplicidade |

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
  Usando o `AtendePrint.exe`, o Node não é necessário.

## Passo a passo do modo USB

1. Instale a impressora no Windows (Configurações > Bluetooth e dispositivos > Impressoras e scanners) e confirme que ela aparece lá, ligada e sem erro.
2. Descubra o **nome exato** dela:

   ```powershell
   node printer-agent/agent.js --list-printers
   ```

   Se estiver usando o executável instalado:

   ```powershell
   & "$env:LOCALAPPDATA\AtendeAI\AtendePrint\AtendePrint.exe" --list-printers
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
     "printerName": "",
     "columns": 42,
     "maxLines": 0,
     "pollSeconds": 5
   }
   ```

   - `columns`: largura do cupom em colunas — `42` para papel de 80 mm e `32` para 58 mm.
   - `maxLines`: altura do cupom em linhas. Use `0` (padrão) para o cupom ficar do tamanho do pedido.
   - `printerName`: pode ficar **vazio**. O agente detecta a impressora USB do PC sozinho e mostra na
     tela Impressão do painel, onde o usuário confirma ou troca. Se preencher, o nome precisa ser
     idêntico ao que aparece em Impressoras e scanners (maiúsculas, espaços e acentos contam).
   - Todas essas opções também podem ser ajustadas depois pelo painel, sem reinstalar.

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

Além disso, o agente envia o **relatório de impressoras** para `/api/printer-agent/report`, no máximo
a cada 10 segundos, com: nome da máquina, versão, plataforma, modo, impressora em uso, largura,
altura, o estado da conexão, a lista de impressoras do Windows (`name`, `port`, `driver`, `usb`) e as
últimas atividades de impressão. É esse relatório que alimenta a tela Impressão do painel.

| Rota | Método | Para que serve |
| --- | --- | --- |
| `/api/printer-agent/report` | POST | O agente informa impressoras e estado (chamado pelo agente) |
| `/api/printer-agent` | GET | O painel lista os agentes conhecidos |
| `/api/printer-config` | GET | O agente busca modo, largura, altura e layout definidos no painel |

> Se aparecer `A VPS está com uma versão antiga e ainda não possui as rotas de impressão`, o servidor
> publicado ainda não tem o `server.js` atualizado. Publique a versão atual para que o modo/impressora
> salvos no painel cheguem ao agente. Nada quebra: o agente continua usando o `config.json` local.

> `GET /api/print-jobs` **consome** a fila (marca `pending` → `printing`). Não chame esse endereço
> manualmente com o agente ligado, senão o pedido fica preso e só volta para a fila depois de 10 minutos.

## Scripts prontos (Windows)

| Script | Para que serve |
| --- | --- |
| `instalar-inicio-automatico.ps1` | Alternativa ao instalador para uso em desenvolvimento: registra a tarefa agendada **AtendePrint**, que sobe o agente a cada logon. Não precisa de administrador. |
| `iniciar-agente.ps1` | Roda o agente em primeiro plano gravando tudo em `printer-agent/agent.log` (UTF-8). Útil para ver o que está acontecendo. |
| `enviar-teste.ps1` | Cria um pedido de teste na plataforma para conferir a impressão de ponta a ponta. |
| `list-printers.ps1` | Lista os nomes exatos das impressoras do Windows (não precisa de Node.js). |
| `listar-impressoras.ps1` | Igual ao anterior, mas grava o resultado em um arquivo (`-OutFile`). É o que o instalador usa para montar a lista de impressoras. |
| `parar-agentes-antigos.ps1` | Remove a tarefa agendada antiga e encerra agentes que rodavam pela pasta do projeto, evitando dois agentes na mesma fila. |
| `printer-info.ps1` | Diagnóstico: serviço de spooler, impressoras, portas e fila de impressão. |
| `build-windows.ps1` | Gera `dist\AtendePrint.exe` com ícone e versão aplicados. |
| `build-installer.ps1` | Gera o instalador final `dist\installer\AtendePrint-Setup-v3.0.0.exe`. |

Uso típico em desenvolvimento:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File printer-agent/instalar-inicio-automatico.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File printer-agent/enviar-teste.ps1
```

Para parar/remover o início automático de desenvolvimento:

```powershell
Stop-ScheduledTask -TaskName 'AtendePrint'
Unregister-ScheduledTask -TaskName 'AtendePrint' -Confirm:$false
```

Depois de instalado pelo instalador, o início automático é um atalho em
`shell:startup` (não uma tarefa agendada). Para conferir:

```powershell
Get-ChildItem ([Environment]::GetFolderPath('Startup')) | Where-Object Name -like 'AtendePrint*'
Get-Process AtendePrint -ErrorAction SilentlyContinue
```

## Variáveis de ambiente

| Variável | Padrão | Descrição |
| --- | --- | --- |
| `ATENDEAI_API_URL` | `http://localhost:3000` | URL da plataforma |
| `ATENDEAI_PRINT_MODE` | `virtual` | `virtual`, `usb` ou `escpos` |
| `PRINTER_NAME` | vazio | Nome da impressora do Windows (modo `usb`) |
| `PRINTER_HOST` | vazio | IP/hostname (modo `escpos`) |
| `PRINTER_PORT` | `9100` | Porta (modo `escpos`) |
| `PRINTER_COLUMNS` | `42` | Largura do cupom em colunas (42 = 80 mm, 32 = 58 mm) |
| `PRINTER_MAX_LINES` | `0` | Altura do cupom em linhas (0 = do tamanho do pedido) |
| `ATENDEAI_POLL_MS` | `5000` | Intervalo de busca em milissegundos |
| `ATENDEAI_MACHINE` | nome do PC | Nome que o painel usa para identificar este computador |

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
printer-agent/dist/installer/AtendePrint-Setup-v3.0.0.exe
```

### O que o assistente faz

1. **Conexão** – pede a URL da plataforma (já vem preenchida com o endereço atual).
2. **Modo de impressão** – `Virtual`, `ESC/POS por rede` ou `USB / Windows` (já vem marcado USB).
3. **Impressora** – lê as impressoras instaladas neste PC e mostra uma **lista para escolher**,
   em vez de obrigar o usuário a digitar o nome exato (era aí que a impressão quebrava antes).
   Esta tela só aparece no modo USB.
4. **Rede e formato** – IP/hostname (só no modo rede), porta, **largura do cupom** (`42` = 80 mm,
   `32` = 58 mm), **altura do cupom em linhas** (`0` = do tamanho do pedido) e o intervalo de busca.
   Tudo isso também pode ser ajustado depois no painel, na tela Impressão.

Ao concluir, o instalador:

- encerra um agente que já esteja aberto (`taskkill`);
- copia o `AtendePrint.exe` e o `parar-agentes-antigos.ps1` para
  `%LOCALAPPDATA%\AtendeAI\AtendePrint` (não precisa de administrador);
- grava o `config.json` na mesma pasta com as respostas do assistente;
- roda `parar-agentes-antigos.ps1`, que remove a antiga **tarefa agendada** e encerra agentes
  iniciados a partir da pasta do projeto — isso evita **dois agentes disputando a mesma fila**;
- cria os atalhos (inicialização automática em segundo plano, Área de Trabalho e Menu Iniciar) e
  já sobe o agente escondido, para começar a imprimir.

### Onde ficam as coisas depois de instalado

| Item | Caminho |
| --- | --- |
| Executável e `config.json` | `%LOCALAPPDATA%\AtendeAI\AtendePrint` |
| Cupons do modo `virtual` | `%LOCALAPPDATA%\AtendeAI\AtendePrint\output` |
| Início automático (oculto) | atalho em `shell:startup` |
| Atalhos manuais | Área de Trabalho e Menu Iniciar (reiniciam o agente em segundo plano) |
| Desinstalar | "Aplicativos instalados" do Windows → **AtendePrint** |

Para diagnosticar depois de instalado, sem depender de Node.js:

```powershell
& "$env:LOCALAPPDATA\AtendeAI\AtendePrint\AtendePrint.exe" --list-printers
& "$env:LOCALAPPDATA\AtendeAI\AtendePrint\AtendePrint.exe" --test
```

### Gerar só o executável (sem instalador)

```powershell
Set-Location printer-agent
npm install          # só na primeira vez
./build-windows.ps1
```

> Se o `npm` não estiver no PATH (Node portátil), o `build-windows.ps1` usa as dependências já
> instaladas em `node_modules` em vez de falhar.

O arquivo será `printer-agent/dist/AtendePrint.exe`. Coloque o `config.json` ao lado dele
(o `build-windows.ps1` copia o `config.sample.json` apenas se o `config.json` ainda não existir).

### Como o ícone é aplicado

O `pkg` não sabe embutir ícone e aplicar o ícone **depois** do empacotamento
(`rcedit`/`resedit`) destrói o overlay que o `pkg` anexa no fim do arquivo — o `.exe` passa a
falhar com `Pkg: Error reading from file`. Por isso o `build-windows.ps1`:

1. gera o `assets/AtendePrint.ico` (7 resoluções) a partir do `assets/AtendePrint-Logo.png`
   com o `gerar-icone.ps1`;
2. aplica ícone + informações de versão no **binário base do Node** com o
   `preparar-node-icone.ps1` (fica em `.pkg-node\`, com backup `.bak` intacto);
3. empacota apontando o `pkg` para esse binário via `PKG_NODE_PATH`.

Só o passo 3 depende do `pkg`; os passos 1 e 2 são scripts PowerShell comuns.

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
| Cupom sobrando papel em branco ou cortando o rodapé | Ajuste **Comprimento/altura** na tela Impressão (`0` = do tamanho do pedido) |
| Painel mostra "agente offline" | O `AtendePrint.exe` não está rodando no PC, ou a `apiUrl` do `config.json` está errada |
| Painel não lista nenhuma impressora | Serviço `Spooler` parado, nenhuma impressora instalada, ou a VPS ainda não tem as rotas novas |
| Impressora aparece no painel mas marcada como "outra" | Ela não está em porta USB (ex.: `PORTPROMPT:`, `SHRFAX:`) — o agente prefere automaticamente a USB |
| Pedido ficou "Imprimindo" e sumiu da fila | O agente devolve o pedido para a fila depois de 10 minutos |

Para ver o que o agente está fazendo quando instalado:

```powershell
Get-Content "$env:LOCALAPPDATA\AtendeAI\AtendePrint\agent.log" -Tail 40
Get-Process AtendePrint -ErrorAction SilentlyContinue
```
