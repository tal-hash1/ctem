#!/usr/bin/env bash
set -euo pipefail
RUNDIR=".ctem"

if [ -d "${RUNDIR}" ]; then
  if docker compose version >/dev/null 2>&1; then DC="docker compose"; else DC="docker-compose"; fi
  echo "Stopping CTEM..."
  ( cd "${RUNDIR}" && ${DC} down ) || true
  echo "Removing ${RUNDIR}..."
  rm -rf "${RUNDIR}"
  echo "Done."
else
  echo "Nothing to remove (no ${RUNDIR} dir)."
fi
