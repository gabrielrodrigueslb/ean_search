#!/usr/bin/env sh
set -eu

ROOT_DIR=$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)
BACKUP_DIR="${ROOT_DIR}/backups"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
DB_NAME=$(docker compose -f "${ROOT_DIR}/docker-compose.yml" exec -T postgres printenv POSTGRES_DB | tr -d '\r')
OUTPUT_FILE="${BACKUP_DIR}/${DB_NAME}_${TIMESTAMP}.dump"

mkdir -p "${BACKUP_DIR}"

docker compose -f "${ROOT_DIR}/docker-compose.yml" exec -T postgres \
  sh -lc 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc' > "${OUTPUT_FILE}"

printf 'Backup gerado em %s\n' "${OUTPUT_FILE}"
