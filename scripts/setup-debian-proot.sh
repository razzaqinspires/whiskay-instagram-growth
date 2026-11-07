#!/usr/bin/env bash
set -Eeuo pipefail

if [[ "$(id -u)" -ne 0 ]]; then
  echo "Jalankan dari shell Debian proot sebagai root: bash scripts/setup-debian-proot.sh" >&2
  exit 1
fi

export DEBIAN_FRONTEND=noninteractive
apt update
apt install -y --no-install-recommends \
  ca-certificates curl git unzip xz-utils \
  python3 python3-venv python3-pip \
  build-essential pkg-config

if ! command -v node >/dev/null 2>&1; then apt install -y --no-install-recommends nodejs; fi
if ! command -v npm >/dev/null 2>&1; then apt install -y --no-install-recommends npm; fi

node_ok="$(node -e 'const [major, minor] = process.versions.node.split(".").map(Number); process.exit(major !== 22 || (major === 22 && minor < 5) ? 1 : 0)' >/dev/null 2>&1 && echo yes || echo no)"
npm_major="$(npm --version | cut -d. -f1)"
if [[ "$node_ok" != "yes" || "$npm_major" -lt 10 ]]; then
  echo "Node.js 22.5–22.x dan npm >=10 diperlukan; terpasang: $(node --version 2>/dev/null || echo unavailable) / npm $(npm --version 2>/dev/null || echo unavailable)." >&2
  echo "Pasang Node.js 22.5–22.x dari sumber tepercaya yang sesuai dengan rilis Debian kamu; skrip tidak akan menurunkan versi Node.js yang sudah terpasang." >&2
  exit 2
fi

npm config set fund false
npm config set audit true
printf '\nDebian proot prerequisites installed. Referral claim processing uses the bot runtime; no separate worker or Redis service is required. Node: %s | npm: %s\n' "$(node --version)" "$(npm --version)"
