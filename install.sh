#!/usr/bin/env bash
set -euo pipefail

APP_NAME="ctem"
IMAGE_DH="docker.io/checkmeifyoucan/ctem:latest"
IMAGE_GHCR="ghcr.io/tal-hash1/ctem:latest"

bold(){ printf "\033[1m%s\033[0m\n" "$*"; }
warn(){ printf "\033[33m%s\033[0m\n" "$*"; }
err(){ printf "\033[31m%s\033[0m\n" "$*"; }

need() {
  command -v "$1" >/dev/null 2>&1 || { err "Missing dependency: $1"; exit 1; }
}

# --- prereqs ---
need docker
if docker compose version >/dev/null 2>&1; then
  DC="docker compose"
elif command -v docker-compose >/dev/null 2>&1; then
  DC="docker-compose"
else
  err "Docker Compose not found. Install Docker Desktop or docker-compose."
  exit 1
fi

bold "CTEM Installer"

# --- choose port ---
default_port=$(( 15000 + RANDOM % 10000 ))
read -rp "Choose a host port to expose the app [default ${default_port}]: " PORT
PORT=${PORT:-$default_port}
if ! [[ "$PORT" =~ ^[0-9]+$ ]]; then
  err "Port must be a number"; exit 1
fi

# --- choose region ---
echo "Select region:"
echo "  1) US (default)"
echo "  2) EU"
read -rp "Enter 1 or 2 [1]: " REGION_CHOICE
REGION_CHOICE=${REGION_CHOICE:-1}

if [ "$REGION_CHOICE" = "2" ]; then
  H3_API_URL="https://api.gateway.horizon3ai.eu/v1/graphql"
  H3_AUTH_URL="https://api.gateway.horizon3ai.eu/v1/auth"
  REGION_TXT="EU"
else
  H3_API_URL="https://api.gateway.horizon3ai.com/v1/graphql"
  H3_AUTH_URL="https://api.gateway.horizon3ai.com/v1/auth"
  REGION_TXT="US"
fi

# --- API key (masked) ---
read -rsp "Paste your Horizon3 API key (hidden input): " H3_API_KEY
echo
if [ -z "${H3_API_KEY}" ]; then err "API key cannot be empty"; exit 1; fi
key_len=${#H3_API_KEY}
mask="$(printf '%*s' $((key_len>4?key_len-4:0)) '' | tr ' ' '*')${H3_API_KEY: -4}"
echo "API key: ${mask}"

# --- make a folder for runtime files (optional; can be current dir) ---
RUNDIR=".ctem"
mkdir -p "$RUNDIR"

# --- write .env ---
cat > "${RUNDIR}/.env" <<EOF
H3_API_URL=${H3_API_URL}
H3_AUTH_URL=${H3_AUTH_URL}
H3_API_KEY=${H3_API_KEY}
PORT=4000
EOF

# --- write docker-compose.yml ---
cat > "${RUNDIR}/docker-compose.yml" <<EOF
services:
  ${APP_NAME}:
    image: ${IMAGE_DH}
    container_name: ${APP_NAME}
    restart: unless-stopped
    env_file:
      - .env
    ports:
      - "${PORT}:4000"
EOF

# --- pull/run with DH, fallback to GHCR if DH not available ---
bold "Pulling image ${IMAGE_DH} ..."
if ! docker pull "${IMAGE_DH}"; then
  warn "Docker Hub pull failed, trying GHCR ${IMAGE_GHCR} ..."
  # swap image in compose file
  sed -i.bak "s|${IMAGE_DH}|${IMAGE_GHCR}|" "${RUNDIR}/docker-compose.yml" || true
  docker pull "${IMAGE_GHCR}"
fi

# --- up the stack ---
bold "Starting ${APP_NAME} on http://localhost:${PORT} ..."
( cd "${RUNDIR}" && ${DC} up -d )

# --- quick health check ---
sleep 1
echo
bold "Health check:"
curl -fsS "http://localhost:${PORT}/health" || true
echo
echo
bold "Done!"
echo "Region: ${REGION_TXT}"
echo "API URL: ${H3_API_URL}"
echo "Auth URL: ${H3_AUTH_URL}"
echo
echo "Manage with:"
echo "  cd ${RUNDIR}"
echo "  ${DC} logs -f"
echo "  ${DC} down    # to stop"
