; Instalador do AtendePrint - agente de impressao do painel AtendeAI.
; Gera um .exe que instala o agente, descobre as impressoras do PC e ja cria o
; inicio automatico no Windows. Compilar com: ISCC.exe installer.iss
; (ou rode build-installer.ps1, que cuida disso).

#define AppName "AtendePrint"
#define AppVersion "2.0.0"
#define AppPublisher "AtendeAI"
#define AppExeName "AtendePrint.exe"
#define AppIcon "assets\AtendePrint.ico"
#define CleanupScript "parar-agentes-antigos.ps1"
#define PrinterListScript "listar-impressoras.ps1"

[Setup]
AppId={{B7A0C6D6-4F1C-4A13-9CF3-1234567890AB}
AppName={#AppName}
AppVersion={#AppVersion}
AppPublisher={#AppPublisher}
DefaultDirName={localappdata}\AtendeAI\AtendePrint
DisableProgramGroupPage=yes
OutputDir=dist\installer
OutputBaseFilename=AtendePrint-Setup-v{#AppVersion}
SetupIconFile={#AppIcon}
UninstallDisplayIcon={app}\{#AppExeName}
UninstallDisplayName={#AppName}
Compression=lzma
SolidCompression=yes
WizardStyle=modern
PrivilegesRequired=lowest
ArchitecturesInstallIn64BitMode=x64compatible

[Languages]
Name: "brazilianportuguese"; MessagesFile: "compiler:Languages\BrazilianPortuguese.isl"

[Files]
Source: "dist\{#AppExeName}"; DestDir: "{app}"; Flags: ignoreversion
Source: "{#CleanupScript}"; DestDir: "{app}"; Flags: ignoreversion
; Usado apenas durante o assistente para descobrir as impressoras instaladas.
Source: "{#PrinterListScript}"; Flags: dontcopy

[Icons]
Name: "{userstartup}\{#AppName}"; Filename: "{app}\{#AppExeName}"; WorkingDir: "{app}"
Name: "{autodesktop}\{#AppName}"; Filename: "{app}\{#AppExeName}"; WorkingDir: "{app}"; Tasks: desktopicon

[Tasks]
Name: "desktopicon"; Description: "Criar atalho na Area de Trabalho"; GroupDescription: "Atalhos adicionais:"

[UninstallDelete]
Type: filesandordirs; Name: "{app}\output"
Type: files; Name: "{app}\config.json"
Type: files; Name: "{app}\.agent.lock"

[UninstallRun]
Filename: "{sys}\taskkill.exe"; Parameters: "/F /IM {#AppExeName}"; Flags: runhidden; RunOnceId: "EncerrarAgente"

[Code]
var
  ConfigPage: TInputQueryWizardPage;
  ModePage: TInputOptionWizardPage;
  PrinterListPage: TInputOptionWizardPage;
  PrinterPage: TInputQueryWizardPage;
  ImpressorasDetectadas: TArrayOfString;
  NomesImpressoras: TArrayOfString;
  ImpressorasEncontradas: Integer;

procedure InitializeWizard;
var
  ListaArquivo: String;
  ResultCode: Integer;
  i: Integer;
begin
  ConfigPage := CreateInputQueryPage(wpWelcome, 'Conexao com a plataforma', 'Configure o AtendePrint', 'Informe o endereco da sua plataforma AtendeAI.');
  ConfigPage.Add('URL da plataforma:', False);
  ConfigPage.Values[0] := 'https://www.anota.ai.venusdev.xyz';

  ModePage := CreateInputOptionPage(ConfigPage.ID, 'Modo de impressao', 'Escolha como deseja imprimir', 'Voce pode trocar este modo depois editando config.json.', True, False);
  ModePage.Add('Virtual (teste sem impressora)');
  ModePage.Add('ESC/POS por rede');
  ModePage.Add('USB / Windows (impressora instalada neste PC)');
  ModePage.SelectedValueIndex := 2;

  { Le as impressoras do proprio PC: evita o usuario digitar o nome exato errado
    (parenteses, acentos e espacos do nome do Windows sao faceis de errar). }
  ImpressorasEncontradas := 0;
  ExtractTemporaryFile('{#PrinterListScript}');
  ListaArquivo := ExpandConstant('{tmp}\impressoras-detectadas.txt');
  if Exec(ExpandConstant('{sys}\WindowsPowerShell\v1.0\powershell.exe'), '-NoProfile -ExecutionPolicy Bypass -File "' + ExpandConstant('{tmp}\{#PrinterListScript}') + '" -OutFile "' + ListaArquivo + '"', '', SW_HIDE, ewWaitUntilTerminated, ResultCode) then
    LoadStringsFromFile(ListaArquivo, ImpressorasDetectadas);

  PrinterListPage := CreateInputOptionPage(ModePage.ID, 'Impressora', 'Escolha a impressora deste PC', 'Impressoras instaladas no Windows, usadas no modo USB.', True, False);
  SetArrayLength(NomesImpressoras, 0);
  for i := 0 to GetArrayLength(ImpressorasDetectadas) - 1 do
    if Trim(ImpressorasDetectadas[i]) <> '' then
    begin
      PrinterListPage.Add(Trim(ImpressorasDetectadas[i]));
      SetArrayLength(NomesImpressoras, ImpressorasEncontradas + 1);
      NomesImpressoras[ImpressorasEncontradas] := Trim(ImpressorasDetectadas[i]);
      ImpressorasEncontradas := ImpressorasEncontradas + 1;
    end;
  if ImpressorasEncontradas = 0 then PrinterListPage.Add('(nenhuma impressora detectada)');
  PrinterListPage.SelectedValueIndex := 0;

  PrinterPage := CreateInputQueryPage(PrinterListPage.ID, 'Rede e formato', 'Ajustes de impressao', 'Preencha o IP apenas no modo ESC/POS por rede.');
  PrinterPage.Add('IP ou hostname (modo ESC/POS por rede):', False);
  PrinterPage.Add('Porta:', False);
  PrinterPage.Add('Largura do cupom em colunas (42 = 80mm, 32 = 58mm):', False);
  PrinterPage.Add('Intervalo de busca (segundos):', False);
  PrinterPage.Values[1] := '9100';
  PrinterPage.Values[2] := '42';
  PrinterPage.Values[3] := '5';
end;

function ShouldSkipPage(PageID: Integer): Boolean;
begin
  { A lista de impressoras so faz sentido no modo USB. }
  Result := (PageID = PrinterListPage.ID) and (ModePage.SelectedValueIndex <> 2);
end;

function NomeImpressoraEscolhida: String;
begin
  Result := '';
  if (ImpressorasEncontradas > 0) and (PrinterListPage.SelectedValueIndex >= 0) then
    Result := NomesImpressoras[PrinterListPage.SelectedValueIndex];
end;

function JsonEscape(Value: String): String;
begin
  StringChangeEx(Value, '\\', '\\\\', True);
  StringChangeEx(Value, '"', '\\"', True);
  Result := Value;
end;

procedure CurStepChanged(CurStep: TSetupStep);
var
  ConfigFile: String;
  Mode: String;
  ResultCode: Integer;
begin
  if CurStep = ssInstall then
  begin
    { Libera o .exe antes de copiar, para o instalador conseguir atualizar por cima. }
    Exec(ExpandConstant('{sys}\taskkill.exe'), '/F /IM {#AppExeName}', '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
    Exit;
  end;
  if CurStep <> ssPostInstall then Exit;
  if ModePage.SelectedValueIndex = 2 then Mode := 'usb'
  else if ModePage.SelectedValueIndex = 1 then Mode := 'escpos'
  else Mode := 'virtual';
  ConfigFile := ExpandConstant('{app}\config.json');
  SaveStringToFile(ConfigFile,
    '{' + #13#10 +
    '  "apiUrl": "' + JsonEscape(ConfigPage.Values[0]) + '",' + #13#10 +
    '  "mode": "' + Mode + '",' + #13#10 +
    '  "printerName": "' + JsonEscape(NomeImpressoraEscolhida) + '",' + #13#10 +
    '  "columns": ' + PrinterPage.Values[2] + ',' + #13#10 +
    '  "pollSeconds": ' + PrinterPage.Values[3] + ',' + #13#10 +
    '  "printerHost": "' + JsonEscape(PrinterPage.Values[0]) + '",' + #13#10 +
    '  "printerPort": ' + PrinterPage.Values[1] + #13#10 +
    '}' + #13#10, False);
  { Evita dois agentes disputando a mesma fila: remove a tarefa agendada antiga
    e encerra os agentes que rodavam a partir da pasta do projeto. }
  Exec(ExpandConstant('{sys}\WindowsPowerShell\v1.0\powershell.exe'), '-NoProfile -ExecutionPolicy Bypass -File "' + ExpandConstant('{app}\{#CleanupScript}') + '"', ExpandConstant('{app}'), SW_HIDE, ewWaitUntilTerminated, ResultCode);
  Exec(ExpandConstant('{app}\{#AppExeName}'), '', ExpandConstant('{app}'), SW_HIDE, ewNoWait, ResultCode);
end;
