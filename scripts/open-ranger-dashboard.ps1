param(
  [string]$Url = "http://127.0.0.1:4321"
)

$ErrorActionPreference = "Stop"

$ProjectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$LogDir = Join-Path $ProjectRoot ".local-logs"
$OpenLog = Join-Path $LogDir "browser-open.log"
New-Item -ItemType Directory -Force -Path $LogDir | Out-Null

function Write-OpenLog {
  param([string]$Message)
  $line = "[{0}] {1}" -f (Get-Date -Format "yyyy-MM-dd HH:mm:ss"), $Message
  Write-Host $Message
  Add-Content -LiteralPath $OpenLog -Value $line -Encoding UTF8
}

function Test-HttpReady {
  param([string]$TargetUrl)

  try {
    $response = Invoke-WebRequest -Uri $TargetUrl -UseBasicParsing -TimeoutSec 3 -ErrorAction Stop
    return $response.StatusCode -ge 200 -and $response.StatusCode -lt 500
  } catch {
    return $false
  }
}

Write-OpenLog "Opening dashboard: $Url"

$ready = $false
for ($i = 1; $i -le 12; $i += 1) {
  if (Test-HttpReady -TargetUrl $Url) {
    $ready = $true
    break
  }
  Start-Sleep -Milliseconds 500
}

if (-not $ready) {
  Write-OpenLog "Dashboard did not respond before opening. Continuing anyway."
}

$browserCandidates = @(
  "$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
  "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe",
  "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe",
  "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe"
) | Where-Object { $_ -and (Test-Path $_) }

foreach ($browser in $browserCandidates) {
  try {
    Write-OpenLog "Trying browser app window: $browser"
    Start-Process -FilePath $browser -ArgumentList @("--app=$Url", "--start-maximized") -WindowStyle Normal
    Start-Sleep -Milliseconds 900
    Write-OpenLog "Browser app window command sent."
    exit 0
  } catch {
    Write-OpenLog "Browser app window failed: $($_.Exception.Message)"
  }
}

try {
  Write-OpenLog "Trying cmd.exe start URL handler."
  Start-Process -FilePath "cmd.exe" -ArgumentList @("/c", "start", '""', $Url) -WindowStyle Hidden
  Start-Sleep -Milliseconds 800
  Write-OpenLog "cmd.exe start command sent."
  exit 0
} catch {
  Write-OpenLog "cmd.exe start failed: $($_.Exception.Message)"
}

try {
  Write-OpenLog "Trying Windows URL handler."
  Start-Process -FilePath "rundll32.exe" -ArgumentList @("url.dll,FileProtocolHandler", $Url) -WindowStyle Normal
  Start-Sleep -Milliseconds 800
  Write-OpenLog "Windows URL handler command sent."
  exit 0
} catch {
  Write-OpenLog "Windows URL handler failed: $($_.Exception.Message)"
}

$shortcutPath = Join-Path $ProjectRoot "OPEN-RANGER-DASHBOARD.url"
Set-Content -LiteralPath $shortcutPath -Value "[InternetShortcut]`r`nURL=$Url`r`n" -Encoding ASCII

try {
  Write-OpenLog "Trying shortcut file: $shortcutPath"
  Start-Process -FilePath "explorer.exe" -ArgumentList $shortcutPath -WindowStyle Normal
  Start-Sleep -Milliseconds 800
  Write-OpenLog "Shortcut open command sent."
  exit 0
} catch {
  Write-OpenLog "Shortcut open failed: $($_.Exception.Message)"
}

foreach ($browser in $browserCandidates) {
  try {
    Write-OpenLog "Trying browser: $browser"
    Start-Process -FilePath $browser -ArgumentList @("--new-window", "--start-maximized", $Url) -WindowStyle Normal
    Start-Sleep -Milliseconds 800
    Write-OpenLog "Browser launch command sent."
    exit 0
  } catch {
    Write-OpenLog "Browser failed: $($_.Exception.Message)"
  }
}

try {
  Write-OpenLog "Trying explorer.exe fallback."
  Start-Process -FilePath "explorer.exe" -ArgumentList $Url -WindowStyle Normal
  Start-Sleep -Milliseconds 800
  Write-OpenLog "explorer.exe command sent."
  exit 0
} catch {
  Write-OpenLog "explorer.exe failed: $($_.Exception.Message)"
}

Write-OpenLog "All browser open methods failed. URL copied to clipboard."
try {
  Set-Clipboard -Value $Url
} catch {
  Write-OpenLog "Clipboard copy failed: $($_.Exception.Message)"
}
exit 1
