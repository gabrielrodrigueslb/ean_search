#!/usr/bin/env sh
set -eu

if [ "$#" -ne 1 ]; then
  printf 'Uso: %s <arquivo.dump|arquivo.sql>\n' "$0"
  exit 1
fi

INPUT_FILE="$1"
ROOT_DIR=$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)

if [ ! -f "${INPUT_FILE}" ]; then
  printf 'Arquivo nao encontrado: %s\n' "${INPUT_FILE}"
  exit 1
fi

case "${INPUT_FILE}" in
  *.dump|*.backup)
    cat "${INPUT_FILE}" | docker compose -f "${ROOT_DIR}/docker-compose.yml" exec -T postgres \
      sh -lc 'pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --clean --if-exists --no-owner'
    ;;
  *.sql)
    cat "${INPUT_FILE}" | docker compose -f "${ROOT_DIR}/docker-compose.yml" exec -T postgres \
      sh -lc 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"'
    ;;
  *)
    printf 'Formato nao suportado. Use .dump, .backup ou .sql\n'
    exit 1
    ;;
esac

printf 'Restore concluido a partir de %s\n' "${INPUT_FILE}"
