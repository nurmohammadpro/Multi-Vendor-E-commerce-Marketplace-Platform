#!/usr/bin/env bash
set -euo pipefail

if [ -f .env ]; then
  while IFS= read -r line || [ -n "$line" ]; do
    line=${line%$'\r'}
    case "$line" in
      ''|\#*)
        continue
        ;;
    esac
    export "$line"
  done < ./.env
fi

exec "$@"
