param(
  [string]$PrinterName = "",
  [string]$LabelPrinterName = "",
  [int]$Port = 17658
)

$ErrorActionPreference = "Stop"

$TaskName = "Multi Vendor Print Agent"
$AgentDir = Resolve-Path (Join-Path $PSScriptRoot "..")
$NodeCommand = Get-Command node -ErrorAction SilentlyContinue

if (-not $NodeCommand) {
  Write-Error "Node.js is required. Install Node.js 18+ first, then rerun this script."
}

$PowerShellCommand = @"
Set-Location '$AgentDir'
`$env:MVP_PRINT_AGENT_PORT = '$Port'
`$env:MVP_ALLOWED_ORIGINS = 'http://localhost:3000,http://127.0.0.1:3000,https://app.example.com'
"@

if ($PrinterName.Trim().Length -gt 0) {
  $PowerShellCommand += "`n`$env:MVP_PRINTER_NAME = '$PrinterName'"
}

if ($LabelPrinterName.Trim().Length -gt 0) {
  $PowerShellCommand += "`n`$env:MVP_LABEL_PRINTER_NAME = '$LabelPrinterName'"
}

$PowerShellCommand += "`nnode server.js"

$Action = New-ScheduledTaskAction `
  -Execute "powershell.exe" `
  -Argument "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -Command $PowerShellCommand"
$Trigger = New-ScheduledTaskTrigger -AtLogOn
$Principal = New-ScheduledTaskPrincipal -UserId $env:USERNAME -LogonType Interactive -RunLevel LeastPrivilege
$Settings = New-ScheduledTaskSettingsSet `
  -AllowStartIfOnBatteries `
  -DontStopIfGoingOnBatteries `
  -ExecutionTimeLimit (New-TimeSpan -Days 365) `
  -RestartCount 3 `
  -RestartInterval (New-TimeSpan -Minutes 1)

Register-ScheduledTask `
  -TaskName $TaskName `
  -Action $Action `
  -Trigger $Trigger `
  -Principal $Principal `
  -Settings $Settings `
  -Force | Out-Null

Start-ScheduledTask -TaskName $TaskName

Write-Host "Installed and started '$TaskName'."
Write-Host "Health check: http://127.0.0.1:$Port/health"
Write-Host "Receipt printer: $(if ($PrinterName.Trim().Length -gt 0) { $PrinterName } else { 'Windows default printer' })"
Write-Host "Label printer: $(if ($LabelPrinterName.Trim().Length -gt 0) { $LabelPrinterName } else { 'Windows default printer' })"
