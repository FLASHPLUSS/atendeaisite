#define AppName "AtendeAI Printer Agent"
#define AppVersion "1.0.0"
#define AppPublisher "AtendeAI"
#define AppExeName "AtendeAI-Printer-Agent.exe"

[Setup]
AppId={{B7A0C6D6-4F1C-4A13-9CF3-1234567890AB}
AppName={#AppName}
AppVersion={#AppVersion}
AppPublisher={#AppPublisher}
DefaultDirName={localappdata}\AtendeAI\PrinterAgent
DisableProgramGroupPage=yes
OutputDir=dist\installer
OutputBaseFilename=AtendeAI-Printer-Agent-Setup-v2
Compression=lzma
SolidCompression=yes
WizardStyle=modern
PrivilegesRequired=lowest
ArchitecturesInstallIn64BitMode=x64compatible

[Files]
Source: "dist\{#AppExeName}"; DestDir: "{app}"; Flags: ignoreversion

[Icons]
Name: "{userstartup}\AtendeAI Printer Agent"; Filename: "{app}\{#AppExeName}"; WorkingDir: "{app}"
Name: "{autodesktop}\AtendeAI Printer Agent"; Filename: "{app}\{#AppExeName}"; WorkingDir: "{app}"; Tasks: desktopicon

[Tasks]
Name: "desktopicon"; Description: "Criar atalho na Area de Trabalho"; GroupDescription: "Atalhos adicionais:"

[UninstallDelete]
Type: filesandordirs; Name: "{app}\output"

[Code]
var
  ConfigPage: TInputQueryWizardPage;
  ModePage: TInputOptionWizardPage;
  PrinterPage: TInputQueryWizardPage;

procedure InitializeWizard;
begin
  ConfigPage := CreateInputQueryPage(wpWelcome, 'Conexao com a plataforma', 'Configure o agente de impressao', 'Informe o endereco da sua plataforma AtendeAI.');
  ConfigPage.Add('URL da plataforma:', False);
  ConfigPage.Values[0] := 'https://www.anota.ai.venusdev.xyz';

  ModePage := CreateInputOptionPage(ConfigPage.ID, 'Modo de impressao', 'Escolha como deseja imprimir', 'Voce pode trocar este modo depois editando config.json.', True, False);
  ModePage.Add('Virtual (teste sem impressora)');
  ModePage.Add('ESC/POS por rede');
  ModePage.Add('USB / Windows (impressora instalada neste PC)');
  ModePage.SelectedValueIndex := 2;

  PrinterPage := CreateInputQueryPage(ModePage.ID, 'Impressora', 'Dados da impressora', 'Preencha apenas o modo escolhido. No modo virtual deixe tudo vazio.');
  PrinterPage.Add('Nome da impressora no Windows (modo USB):', False);
  PrinterPage.Add('IP ou hostname (modo ESC/POS por rede):', False);
  PrinterPage.Add('Porta:', False);
  PrinterPage.Add('Largura do cupom em colunas (42 = 80mm, 32 = 58mm):', False);
  PrinterPage.Add('Intervalo de busca (segundos):', False);
  PrinterPage.Values[2] := '9100';
  PrinterPage.Values[3] := '42';
  PrinterPage.Values[4] := '5';
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
  if CurStep <> ssPostInstall then Exit;
  if ModePage.SelectedValueIndex = 2 then Mode := 'usb'
  else if ModePage.SelectedValueIndex = 1 then Mode := 'escpos'
  else Mode := 'virtual';
  ConfigFile := ExpandConstant('{app}\config.json');
  SaveStringToFile(ConfigFile,
    '{' + #13#10 +
    '  "apiUrl": "' + JsonEscape(ConfigPage.Values[0]) + '",' + #13#10 +
    '  "mode": "' + Mode + '",' + #13#10 +
    '  "printerName": "' + JsonEscape(PrinterPage.Values[0]) + '",' + #13#10 +
    '  "columns": ' + PrinterPage.Values[3] + ',' + #13#10 +
    '  "pollSeconds": ' + PrinterPage.Values[4] + ',' + #13#10 +
    '  "printerHost": "' + JsonEscape(PrinterPage.Values[1]) + '",' + #13#10 +
    '  "printerPort": ' + PrinterPage.Values[2] + #13#10 +
    '}' + #13#10, False);
  Exec(ExpandConstant('{app}\{#AppExeName}'), '', ExpandConstant('{app}'), SW_HIDE, ewNoWait, ResultCode);
end;
