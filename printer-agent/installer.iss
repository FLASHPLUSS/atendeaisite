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
OutputBaseFilename=AtendeAI-Printer-Agent-Setup
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
  ConfigPage.Values[0] := 'https://seu-dominio.com';

  ModePage := CreateInputOptionPage(ConfigPage.ID, 'Modo de impressao', 'Escolha como deseja testar', 'Voce pode trocar este modo depois editando config.json.', True, False);
  ModePage.Add('Virtual (teste sem impressora)');
  ModePage.Add('ESC/POS por rede');
  ModePage.SelectedValueIndex := 0;

  PrinterPage := CreateInputQueryPage(ModePage.ID, 'Impressora ESC/POS', 'Dados da impressora de rede', 'Preencha se selecionou ESC/POS por rede.');
  PrinterPage.Add('IP ou hostname:', False);
  PrinterPage.Add('Porta:', False);
  PrinterPage.Add('Intervalo de busca (segundos):', False);
  PrinterPage.Values[1] := '9100';
  PrinterPage.Values[2] := '5';
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
  if ModePage.SelectedValueIndex = 1 then Mode := 'escpos' else Mode := 'virtual';
  ConfigFile := ExpandConstant('{app}\config.json');
  SaveStringToFile(ConfigFile,
    '{' + #13#10 +
    '  "apiUrl": "' + JsonEscape(ConfigPage.Values[0]) + '",' + #13#10 +
    '  "mode": "' + Mode + '",' + #13#10 +
    '  "pollSeconds": ' + PrinterPage.Values[2] + ',' + #13#10 +
    '  "printerHost": "' + JsonEscape(PrinterPage.Values[0]) + '",' + #13#10 +
    '  "printerPort": ' + PrinterPage.Values[1] + #13#10 +
    '}' + #13#10, False);
  Exec(ExpandConstant('{app}\{#AppExeName}'), '', ExpandConstant('{app}'), SW_HIDE, ewNoWait, ResultCode);
end;
