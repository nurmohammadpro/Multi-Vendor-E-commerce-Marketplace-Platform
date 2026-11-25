#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "$0")" && pwd)"
migrations_dir="$script_dir/migrations"

if [ ! -d "$migrations_dir" ]; then
  echo "ERROR: migrations/ directory not found at $migrations_dir"
  exit 1
fi

errors=0

echo "Checking migration prefixes in $migrations_dir ..."

# Work from the migrations dir so paths don't contain spaces
cd "$migrations_dir"

# 1. Duplicate numeric prefix check
files=$(ls ./*.sql 2>/dev/null | xargs -n1 basename)
dupes=$(echo "$files" | cut -d'_' -f1 | sort | uniq -d)

if [ -n "$dupes" ]; then
  echo "ERROR: Duplicate migration number prefixes found:"
  echo "$dupes" | while IFS= read -r prefix; do
    echo "  Prefix $prefix:"
    ls "$prefix"_*.sql 2>/dev/null | while read -r f; do
      echo "    - $f"
    done
  done
  errors=1
fi

# 2. Non-4-digit prefix check
bad_fmt=$(echo "$files" | grep -vE '^[0-9]{4}_' || true)

if [ -n "$bad_fmt" ]; then
  echo "ERROR: Files with invalid prefix format (must be NNNN_description.sql):"
  echo "$bad_fmt" | while read -r f; do echo "  - $f"; done
  errors=1
fi

# 3. Sequential gap check (informational only)
prefixes=$(echo "$files" | cut -d'_' -f1 | sort -n | uniq)
expected=1
gaps=0
while IFS= read -r p; do
  p_num=$((10#$p))
  if [ "$p_num" -ne "$expected" ]; then
    echo "NOTE: Gap at $expected (found $p_num)"
    gaps=1
    expected=$((p_num + 1))
  else
    expected=$((expected + 1))
  fi
done <<< "$prefixes"

if [ "$gaps" -eq 1 ]; then
  echo "INFO: Numbering gaps are fine as long as prefixes are unique."
fi

if [ "$errors" -eq 0 ]; then
  echo "All migration prefixes are valid."
  exit 0
else
  last_num=$(echo "$prefixes" | tail -1)
  next_num=$(printf '%04d' $((10#$last_num + 1)))
  echo ""
  echo "Fix: assign a unique 4-digit prefix to each file. Example:"
  echo "  mv DUPE_desc.sql ${next_num}_desc.sql"
  exit 1
fi
