$ErrorActionPreference = "Stop"

$ProjectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$LogDir = Join-Path $ProjectRoot ".local-logs"
$LauncherLog = Join-Path $LogDir "launcher-debug.log"
$StartScript = Join-Path $PSScriptRoot "start-matsu-station.ps1"

New-Item -ItemType Directory -Force -Path $LogDir | Out-Null

$transcriptStarted = $false
$exitCode = 1

try {
  Start-Transcript -Path $LauncherLog -Append | Out-Null
  $transcriptStarted = $true

  Write-Host "Matsu Station local launcher"
  Write-Host "Project: $ProjectRoot"
  Write-Host "Debug log: $LauncherLog"
  Write-Host ""

  & $StartScript
  $exitCode = if ($LASTEXITCODE -is [int]) { $LASTEXITCODE } else { 0 }

  Write-Host ""
  Write-Host "Exit code: $exitCode"
  Write-Host "Local frontend: http://127.0.0.1:3000"
  Write-Host "AI Ranger dashboard: http://127.0.0.1:4321"
  Write-Host "Local health: http://127.0.0.1:3000/api/local-health"

  if ($exitCode -eq 0) {
    if ($env:MATSU_NO_OPEN -eq "1") {
      Write-Host "Browser auto-open skipped by MATSU_NO_OPEN=1."
    } else {
      Write-Host "Opening AI Ranger dashboard..."
      Start-Process "http://127.0.0.1:4321"
    }
  } else {
    Write-Host "Startup failed. Browser will not open automatically."
  }
} catch {
  $exitCode = 1
  Write-Host ""
  Write-Host "ERROR:"
  Write-Host $_.Exception.Message
  Write-Host ""
  $_ | Format-List * -Force
} finally {
  if ($transcriptStarted) {
    Stop-Transcript | Out-Null
  }
}

exit $exitCode
