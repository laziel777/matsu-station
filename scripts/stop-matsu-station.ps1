$ErrorActionPreference = "Stop"

$ProjectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$RuntimeDir = Join-Path $ProjectRoot ".local-runtime"

function Stop-ProcessTree {
  param([int]$RootProcessId)

  $children = Get-CimInstance Win32_Process -Filter "ParentProcessId=$RootProcessId" -ErrorAction SilentlyContinue
  foreach ($child in $children) {
    Stop-ProcessTree -RootProcessId ([int]$child.ProcessId)
  }

  $process = Get-Process -Id $RootProcessId -ErrorAction SilentlyContinue
  if ($process) {
    Stop-Process -Id $RootProcessId -Force
  }
}

function Stop-TrackedProcess {
  param(
    [string]$Name,
    [string]$PidPath
  )

  if (-not (Test-Path $PidPath)) {
    Write-Host "$Name has no PID record. Skipping."
    return
  }

  $pidText = (Get-Content -LiteralPath $PidPath -Raw).Trim()
  $processId = 0
  if (-not [int]::TryParse($pidText, [ref]$processId)) {
    Write-Host "$Name has an invalid PID record: $pidText"
    Remove-Item -LiteralPath $PidPath -Force
    return
  }

  $process = Get-Process -Id $processId -ErrorAction SilentlyContinue
  if ($process) {
    Stop-ProcessTree -RootProcessId $processId
    Write-Host "$Name stopped. PID: $processId"
  } else {
    Write-Host "$Name PID $processId is not running."
  }

  Remove-Item -LiteralPath $PidPath -Force
}

function Stop-ProjectPortListeners {
  param([int[]]$Ports)

  foreach ($port in $Ports) {
    $listeners = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
    foreach ($listener in $listeners) {
      $processId = [int]$listener.OwningProcess
      $processInfo = Get-CimInstance Win32_Process -Filter "ProcessId=$processId" -ErrorAction SilentlyContinue
      if ($processInfo -and $processInfo.CommandLine -like "*$ProjectRoot*") {
        Stop-ProcessTree -RootProcessId $processId
        Write-Host "Stopped remaining project listener on port $port. PID: $processId"
      }
    }
  }
}

if (Test-Path $RuntimeDir) {
  Stop-TrackedProcess -Name "Matsu Station local frontend" -PidPath (Join-Path $RuntimeDir "frontend.pid")
  Stop-TrackedProcess -Name "AI Ranger local dashboard" -PidPath (Join-Path $RuntimeDir "ranger-lab.pid")
} else {
  Write-Host "No local runtime records found."
}

Stop-ProjectPortListeners -Ports @(3000, 4321)

Write-Host "Local services stop flow completed."
