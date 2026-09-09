#!/usr/bin/env bash
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
assets="$root/backend/internal/adapter/inbound/http/web/dist"

clean_assets() {
  find "$assets" -mindepth 1 ! -name .keep -delete
}

trap clean_assets EXIT
pnpm --dir "$root/frontend" run build
clean_assets
cp -R "$root/frontend/dist/." "$assets/"
mkdir -p "$root/backend/bin"

cd "$root/backend"
CGO_ENABLED="${CGO_ENABLED:-0}" go build -trimpath -o "${PAPER_OUTPUT:-bin/paper}" ./cmd/api
