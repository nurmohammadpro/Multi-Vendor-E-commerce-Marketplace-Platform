$ErrorActionPreference = "Stop"

$TaskName = "Multi Vendor Print Agent"

if (Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue) {
  Stop-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
  Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
  Write-Host "Uninstalled '$TaskName'."
} else {
  Write-Host "'$TaskName' is not installed."
}
