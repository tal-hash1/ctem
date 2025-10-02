<# 
  CTEM Windows Installer
  - Prompts for port, region, and API key (masked)
  - Writes .ctem\.env and .ctem\docker-compose.yml
  - Pulls docker.io/checkmeifyoucan/ctem:latest (fallback to ghcr.io/tal-hash1/ctem:latest)
  - Starts with docker compose
#>

$ErrorActionPreference = "Stop"

function Write-Bold($msg) { Write-Host $msg -ForegroundColor Cyan }
function Write-Warn($msg) { Write-Host $msg -ForegroundColor Yellow }
function Write-Err($msg)  { Write-Host $msg -ForegroundColor Red }

# --- Preflight checks ---
if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
  Write-Err "Docker is not installed or not on PATH. Please install Docker Desktop, then rerun."
  exit 1
}

# Detect compose command
$composeCmd = $null
try {
  docker compose version | Out-Null
  $composeCmd = "docker compose"
} catch {
  if (Get-Command docker-compose -ErrorAction SilentlyContinue) {
    $composeCmd = "docker-compose"
  } else {
    Write-Err "Docker Compose not found. Install Docker Desktop (includes compose) or docker-compose."
    exit 1
  }
}

Write-Bold "CTEM Installer (Windows)"

# --- Choose port ---
$defaultPort = Get-Random -Minimum 15000 -Maximum 25000
$port = Read-Host "Choose a host port to expose the app [default $defaultPort]"
if ([string]::IsNullOrWhiteSpace($port)) { $port = $defaultPort }
if (-not ($port -as [int])) { Write-Err "Port must be a number"; exit 1 }

# --- Choose region ---
Write-Host "Select region:"
Write-Host "  1) US (default)"
Write-Host "  2) EU"
$regionChoice = Read-Host "Enter 1 or 2 [1]"
if ([string]::IsNullOrWhiteSpace($regionChoice)) { $regionChoice = "1" }

if ($regionChoice -eq "2") {
  $H3_API_URL  = "https://api.gateway.horizon3ai.eu/v1/graphql"
  $H3_AUTH_URL = "https://api.gateway.horizon3ai.eu/v1/auth"
  $REGION_TXT  = "EU"
} else {
  $H3_API_URL  = "https://api.gateway.horizon3ai.com/v1/graphql"
  $H3_AUTH_URL = "https://api.gateway.horizon3ai.com/v1/auth"
  $REGION_TXT  = "US"
}

# --- API key (masked input) ---
# Read as SecureString, then convert to plain for writing .env
$secure = Read-Host -AsSecureString "Paste your Horizon3 API key (hidden input)"
if (-not $secure) { Write-Err "API key cannot be empty"; exit 1 }

# Convert SecureString to plaintext (compatible on Windows PowerShell & PowerShell 7)
$BSTR = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
try {
  $H3_API_KEY = [Runtime.InteropServices.Marshal]::PtrToStringAuto($BSTR)
} finally {
  [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($BSTR)
}

if ([string]::IsNullOrWhiteSpace($H3_API_KEY)) { Write-Err "API key cannot be empty"; exit 1 }

# Mask for display (show last 4)
$last4 = if ($H3_API_KEY.Length -ge 4) { $H3_API_KEY.Substring($H3_API_KEY.Length-4) } else { $H3_API_KEY }
$mask  = ('*' * [Math]::Max(0, $H3_API_KEY.Length - 4)) + $last4
Write-Host "API key: $mask" -ForegroundColor DarkGray

# --- Runtime directory ---
$runDir = ".ctem"
if (-not (Test-Path $runDir)) { New-Item -ItemType Directory -Path $runDir | Out-Null }

# --- Write .env ---
@"
H3_API_URL=$H3_API_URL
H3_AUTH_URL=$H3_AUTH_URL
H3_API_KEY=$H3_API_KEY
PORT=4000
"@ | Out-File -FilePath "$runDir\.env" -Encoding UTF8 -Force

# --- Compose file ---
$imageDH   = "docker.io/checkmeifyoucan/ctem:latest"
$imageGHCR = "ghcr.io/tal-hash1/ctem:latest"

@"
services:
  ctem:
    image: $imageDH
    container_name: ctem
    restart: unless-stopped
    env_file:
      - .env
    ports:
      - "$port:4000"
"@ | Out-File -FilePath "$runDir\docker-compose.yml" -Encoding UTF8 -Force

# --- Pull image (DH, fallback GHCR) ---
Write-Bold "Pulling image $imageDH ..."
$dokPullOk = $true
try {
  docker pull $imageDH | Write-Verbose
} catch {
  $dokPullOk = $false
}
if (-not $dokPullOk) {
  Write-Warn "Docker Hub pull failed; trying GHCR $imageGHCR ..."
  # Replace image in compose file for GHCR
  (Get-Content "$runDir\docker-compose.yml").Replace($imageDH, $imageGHCR) | Set-Content "$runDir\docker-compose.yml"
  docker pull $imageGHCR | Write-Verbose
}

# --- Start stack ---
Write-Bold "Starting CTEM on http://localhost:$port ..."
Push-Location $runDir
try {
  & $composeCmd up -d
} finally {
  Pop-Location
}

Start-Sleep -Seconds 1

# --- Health check ---
Write-Bold "Health check:"
try {
  $resp = Invoke-WebRequest -UseBasicParsing -Uri "http://localhost:$port/health" -TimeoutSec 5
  Write-Host $resp.Content
} catch {
  Write-Warn "Could not reach http://localhost:$port/health yet. Give it a few seconds and refresh in your browser."
}

Write-Host ""
Write-Bold "Done!"
Write-Host "Region: $REGION_TXT"
Write-Host "API URL: $H3_API_URL"
Write-Host "Auth URL: $H3_AUTH_URL"
Write-Host ""
Write-Host "Manage with:"
Write-Host "  cd $runDir"
Write-Host "  $composeCmd logs -f"
Write-Host "  $composeCmd down   # to stop"
