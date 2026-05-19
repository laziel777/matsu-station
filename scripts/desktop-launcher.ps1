$ErrorActionPreference = "Stop"

$ProjectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$LogDir = Join-Path $ProjectRoot ".local-logs"
$LauncherLog = Join-Path $LogDir "desktop-launcher.log"
$StopScript = Join-Path $PSScriptRoot "stop-matsu-station.ps1"
$StartScript = Join-Path $PSScriptRoot "start-matsu-station.ps1"
$OpenScript = Join-Path $PSScriptRoot "open-ranger-dashboard.ps1"
$DashboardUrl = "http://127.0.0.1:4321"

New-Item -ItemType Directory -Force -Path $LogDir | Out-Null

$transcriptStarted = $false
$exitCode = 1

try {
  Start-Transcript -Path $LauncherLog -Append | Out-Null
  $transcriptStarted = $true

  Write-Host "============================================================"
  Write-Host " Matsu Station Desktop Launcher"
  Write-Host "============================================================"
  Write-Host "Project: $ProjectRoot"
  Write-Host "Log: $LauncherLog"
  Write-Host ""

  Write-Host "[1/4] Cleaning previous local project processes..."
  & $StopScript
  Write-Host ""

  Write-Host "[2/4] Starting local services..."
  & $StartScript
  Write-Host ""

  Write-Host "[3/4] Verifying dashboard..."
  $ready = $false
  for ($i = 1; $i -le 20; $i += 1) {
    try {
      $response = Invoke-WebRequest -Uri $DashboardUrl -UseBasicParsing -TimeoutSec 2 -ErrorAction Stop
      if ($response.StatusCode -ge 200 -and $response.StatusCode -lt 500) {
        $ready = $true
        break
      }
    } catch {
      Start-Sleep -Milliseconds 500
    }
  }

  if (-not $ready) {
    throw "Dashboard did not become ready at $DashboardUrl"
  }
  Write-Host "Dashboard ready: $DashboardUrl"
  Write-Host ""

  Write-Host "[4/4] Opening browser..."
  & $OpenScript -Url $DashboardUrl
  $openExit = if ($LASTEXITCODE -is [int]) { $LASTEXITCODE } else { 0 }
  Write-Host "Browser open exit code: $openExit"
  Write-Host ""

  Write-Host "READY"
  Write-Host "Dashboard: $DashboardUrl"
  Write-Host "If the browser still does not appear, double-click OPEN-RANGER-DASHBOARD.cmd or paste the URL above."
  $exitCode = 0
} catch {
  $exitCode = 1
  Write-Host ""
  Write-Host "ERROR"
  Write-Host $_.Exception.Message
  Write-Host ""
  $_ | Format-List * -Force
} finally {
  if ($transcriptStarted) {
    Stop-Transcript | Out-Null
  }
}

exit $exitCode
