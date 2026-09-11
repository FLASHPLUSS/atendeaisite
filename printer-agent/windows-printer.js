import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { formatEscPos } from './escpos.js';

// Script enviado ao PowerShell via -EncodedCommand. Ele fala direto com o spooler
// do Windows (winspool.drv) e manda os bytes ESC/POS crus para a impressora,
// que e exatamente o que impressoras termicas USB esperam receber.
// As mensagens ficam sem acento de proposito: o console do PowerShell usa a
// codepage OEM e acentos apareceriam corrompidos no log do agente.
const SCRIPT = String.raw`$ErrorActionPreference = 'Stop'
$action = $env:ATENDEAI_PRINT_ACTION

if ($action -eq 'list') {
  $spooler = Get-Service -Name Spooler -ErrorAction SilentlyContinue
  if (-not $spooler -or $spooler.Status -ne 'Running') {
    [Console]::Error.WriteLine('O servico de impressao do Windows (Spooler) esta parado, por isso nenhuma impressora aparece. Abra um PowerShell como Administrador e rode: Start-Service Spooler; Set-Service Spooler -StartupType Automatic')
    exit 5
  }
  $printers = @()
  try {
    $printers = @(Get-Printer | ForEach-Object {
      $porta = ''
      try { $porta = [string]$_.PortName } catch { $porta = '' }
      $driver = ''
      try { $driver = [string]$_.DriverName } catch { $driver = '' }
      [pscustomobject]@{ name = [string]$_.Name; port = $porta; driver = $driver }
    })
  } catch { $printers = @() }
  if ($printers.Count -eq 0) {
    try {
      $printers = @(Get-CimInstance -ClassName Win32_Printer | Where-Object { -not $_.Network } | ForEach-Object {
        [pscustomobject]@{ name = [string]$_.Name; port = [string]$_.PortName; driver = [string]$_.DriverName }
      })
    } catch { $printers = @() }
  }
  foreach ($printer in $printers) {
    if (-not $printer.name) { continue }
    # USB001/USB002 ou driver com "USB" no nome = impressora ligada por cabo USB neste PC.
    $usb = $false
    if ($printer.port -match 'USB') { $usb = $true }
    elseif ($printer.driver -match 'USB') { $usb = $true }
    $item = [pscustomobject]@{ name = $printer.name; port = $printer.port; driver = $printer.driver; usb = $usb }
    [Console]::Out.WriteLine(($item | ConvertTo-Json -Compress))
  }
  exit 0
}

if ($action -ne 'print') {
  [Console]::Error.WriteLine('Acao invalida para o agente de impressao.')
  exit 2
}

$printerName = $env:ATENDEAI_PRINTER_NAME
$dataFile = $env:ATENDEAI_PRINT_DATA_FILE

if ([string]::IsNullOrWhiteSpace($printerName)) {
  [Console]::Error.WriteLine('O nome da impressora do Windows nao foi configurado.')
  exit 3
}

if (-not (Test-Path -LiteralPath $dataFile)) {
  [Console]::Error.WriteLine('O arquivo com os dados de impressao nao foi encontrado.')
  exit 4
}

Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;

public static class AtendeAiRawPrinter
{
    // Precisa ser struct: com class + ref o marshaller enviaria um ponteiro duplo
    // e o StartDocPrinter falharia com erro 87 (parametro invalido).
    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    public struct DOC_INFO_1
    {
        [MarshalAs(UnmanagedType.LPWStr)] public string pDocName;
        [MarshalAs(UnmanagedType.LPWStr)] public string pOutputFile;
        [MarshalAs(UnmanagedType.LPWStr)] public string pDatatype;
    }

    [DllImport("winspool.drv", EntryPoint = "OpenPrinterW", SetLastError = true, CharSet = CharSet.Unicode)]
    public static extern bool OpenPrinter(string pPrinterName, out IntPtr phPrinter, IntPtr pDefault);

    [DllImport("winspool.drv", EntryPoint = "ClosePrinter", SetLastError = true)]
    public static extern bool ClosePrinter(IntPtr hPrinter);

    [DllImport("winspool.drv", EntryPoint = "StartDocPrinterW", SetLastError = true, CharSet = CharSet.Unicode)]
    public static extern bool StartDocPrinter(IntPtr hPrinter, int level, ref DOC_INFO_1 di);

    [DllImport("winspool.drv", EntryPoint = "EndDocPrinter", SetLastError = true)]
    public static extern bool EndDocPrinter(IntPtr hPrinter);

    [DllImport("winspool.drv", EntryPoint = "StartPagePrinter", SetLastError = true)]
    public static extern bool StartPagePrinter(IntPtr hPrinter);

    [DllImport("winspool.drv", EntryPoint = "EndPagePrinter", SetLastError = true)]
    public static extern bool EndPagePrinter(IntPtr hPrinter);

    [DllImport("winspool.drv", EntryPoint = "WritePrinter", SetLastError = true)]
    public static extern bool WritePrinter(IntPtr hPrinter, IntPtr pBytes, int dwCount, out int dwWritten);
}
'@ | Out-Null

$bytes = [System.IO.File]::ReadAllBytes($dataFile)
$handle = [IntPtr]::Zero

if (-not [AtendeAiRawPrinter]::OpenPrinter($printerName, [ref]$handle, [IntPtr]::Zero)) {
  $win32Error = [System.Runtime.InteropServices.Marshal]::GetLastWin32Error()
  $spooler = Get-Service -Name Spooler -ErrorAction SilentlyContinue
  if (-not $spooler -or $spooler.Status -ne 'Running') {
    throw 'O servico de impressao do Windows (Spooler) esta parado. Abra um PowerShell como Administrador e rode: Start-Service Spooler; Set-Service Spooler -StartupType Automatic'
  }
  throw "Nao foi possivel abrir a impressora '$printerName' (erro do Windows $win32Error). Confira o nome exato em Impressoras e scanners e se ela esta ligada."
}

try {
  $doc = New-Object 'AtendeAiRawPrinter+DOC_INFO_1'
  $doc.pDocName = 'AtendeAI'
  $doc.pOutputFile = $null
  $doc.pDatatype = 'RAW'

  if (-not [AtendeAiRawPrinter]::StartDocPrinter($handle, 1, [ref]$doc)) {
    throw "Nao foi possivel iniciar o trabalho de impressao na impressora '$printerName' (erro do Windows $([System.Runtime.InteropServices.Marshal]::GetLastWin32Error()))."
  }

  try {
    if (-not [AtendeAiRawPrinter]::StartPagePrinter($handle)) { throw 'Nao foi possivel iniciar a pagina de impressao.' }
    try {
      $pointer = [System.Runtime.InteropServices.Marshal]::AllocHGlobal($bytes.Length)
      try {
        [System.Runtime.InteropServices.Marshal]::Copy($bytes, 0, $pointer, $bytes.Length)
        $written = 0
        if (-not [AtendeAiRawPrinter]::WritePrinter($handle, $pointer, $bytes.Length, [ref]$written)) {
          throw 'Nao foi possivel enviar os dados para a impressora.'
        }
      }
      finally {
        [System.Runtime.InteropServices.Marshal]::FreeHGlobal($pointer)
      }
    }
    finally {
      [AtendeAiRawPrinter]::EndPagePrinter($handle) | Out-Null
    }
  }
  finally {
    [AtendeAiRawPrinter]::EndDocPrinter($handle) | Out-Null
  }
}
finally {
  [AtendeAiRawPrinter]::ClosePrinter($handle) | Out-Null
}

[Console]::Out.WriteLine('ok')
exit 0`;

const encodedScript = Buffer.from(SCRIPT, 'utf16le').toString('base64');

function runPowerShell(extraEnv) {
  return new Promise((resolve, reject) => {
    const child = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-EncodedCommand', encodedScript], {
      windowsHide: true,
      env: { ...process.env, ...extraEnv },
    });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('error', (error) => reject(new Error(`Nao foi possivel executar o PowerShell: ${error.message}`)));
    child.on('close', (code) => {
      const output = stdout.trim();
      const errorOutput = stderr.trim();
      if (code === 0) return resolve(output);
      reject(new Error(errorOutput || output || `O PowerShell finalizou com o codigo ${code}.`));
    });
  });
}

function requireWindows() {
  if (process.platform !== 'win32') {
    throw new Error('O modo USB so funciona no Windows, no mesmo computador em que a impressora esta instalada.');
  }
}

export async function listWindowsPrinters() {
  requireWindows();
  const output = await runPowerShell({ ATENDEAI_PRINT_ACTION: 'list' });
  return output
    .split(/\r?\n/)
    .map((line) => {
      const raw = line.trim();
      if (!raw) return null;
      // Formato novo: uma linha JSON por impressora, com porta e driver.
      if (raw.startsWith('{')) {
        try {
          const parsed = JSON.parse(raw);
          if (parsed?.name) {
            return {
              name: String(parsed.name),
              port: String(parsed.port || ''),
              driver: String(parsed.driver || ''),
              usb: Boolean(parsed.usb),
            };
          }
        } catch {
          // Se vier um JSON quebrado, tratamos a linha como nome simples.
        }
      }
      // Formato antigo (apenas o nome), mantido para nao quebrar nada.
      return { name: raw, port: '', driver: '', usb: /usb/i.test(raw) };
    })
    .filter(Boolean);
}

export async function printWindowsRaw(receipt, { printerName } = {}) {
  requireWindows();
  if (!printerName) throw new Error('O nome da impressora do Windows nao foi configurado. Veja printer-agent/README.md.');
  const directory = path.join(os.tmpdir(), 'atendeai-printer-agent');
  await fs.mkdir(directory, { recursive: true });
  const dataFile = path.join(directory, `cupom-${process.pid}-${Date.now()}.bin`);
  await fs.writeFile(dataFile, formatEscPos(receipt));
  try {
    await runPowerShell({
      ATENDEAI_PRINT_ACTION: 'print',
      ATENDEAI_PRINTER_NAME: printerName,
      ATENDEAI_PRINT_DATA_FILE: dataFile,
    });
  } finally {
    await fs.rm(dataFile, { force: true }).catch(() => {});
  }
}
