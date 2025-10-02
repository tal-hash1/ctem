<# 
  CTEM Windows Uninstaller
  - Stops the docker compose stack created by install.ps1
  - Deletes the .ctem working folder
  - Optional flags: -PurgeImages, -PurgeVolumes
#>

param(
  [switch]$PurgeImages,   # also remove pulled images
  [switch]$PurgeVolumes,  # also remove named/anonymous volumes
  [switch]$Force          # do not prompt for confirmation
)

$ErrorActionPreference = "Stop"

function Write-Bold($msg) { Write-Host $msg -ForegroundColor Cyan }
function Write-Warn($msg) { Write-Host $msg -ForegroundColor Yellow }
function Write-Err($msg)  { Write-Host $msg -ForegroundColor Red }

# Detect compose command
$composeCmd = $null
try {
  docker compose version | Out-Null
  $composeCmd = "docker compose"
} catch {
  if (Get-Command docker-compose -ErrorAction SilentlyContinue) {
    $composeCmd = "docker-compose"
  } else {
    Write-Err "Docker Compose not found. Nothing to stop."
    $composeCmd = $null
  }
}

$runDir = ".ctem"
if (-not (Test-Path $runDir)) {
  Write-Warn "No '$runDir' folder found. Nothing to uninstall."
  exit 0
}

# Show what will be removed
Write-Bold "Preparing to uninstall CTEM"
Write-Host "Working directory: $runDir"
if ($PurgeImages)  { Write-Host "Images will be removed" -ForegroundColor DarkGray }
if ($PurgeVolumes) { Write-Host "Volumes will be removed" -ForegroundColor DarkGray }

# Confirm
if (-not $Force) {
  $answer = Read-Host "Proceed to stop containers and remove '$runDir'? (y/N)"
  if ($answer -notin @('y','Y','yes','YES')) { Write-Host "Aborted."; exit 0 }
}

# Stop stack
if ($composeCmd) {
  try {
    Push-Location $runDir
    & $composeCmd down @(
      if ($PurgeVolumes) { '--volumes' }
    )
  } catch {
    Write-Warn "Compose down failed or stack not running: $($_.Exception.Message)"
  } finally {
    Pop-Location
  }
}

# Purge images if requested
if ($PurgeImages) {
  $images = @(
    'docker.io/checkmeifyoucan/ctem:latest',
    'ghcr.io/tal-hash1/ctem:latest'
  )
  foreach ($img in $images) {
    try {
      Write-Host "Removing image $img ..."
      docker rmi -f $img | Out-Null
    } catch {
      Write-Warn "Could not remove $img (maybe not present): $($_.Exception.Message)"
    }
  }
}

# Remove working directory
try {
  Write-Host "Removing $runDir ..."
  Remove-Item -Recurse -Force $runDir
} catch {
  Write-Warn "Could not remove $runDir: $($_.Exception.Message)"
}

Write-Bold "CTEM uninstalled."
Write-Host "Tip: to reinstall later, run:"
Write-Host '  iwr https://raw.githubusercontent.com/tal-hash1/ctem/main/install.ps1 -UseBasicParsing | iex'
