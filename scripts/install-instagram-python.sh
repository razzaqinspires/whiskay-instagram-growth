#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

PYTHON_BIN="${PYTHON:-python3}"
if ! command -v "$PYTHON_BIN" >/dev/null 2>&1; then
  echo "Python tidak ditemukan: $PYTHON_BIN" >&2
  exit 1
fi
"$PYTHON_BIN" -c 'import sys; print("Python", sys.version.split()[0]); raise SystemExit(0 if sys.version_info >= (3,11) else 1)' || {
  echo "instagrapi 3.2.3 membutuhkan Python 3.11+." >&2
  exit 1
}
"$PYTHON_BIN" -m venv .venv-instagram
.venv-instagram/bin/python -m pip install --upgrade pip
.venv-instagram/bin/python -m pip install -r requirements-instagram.txt
mkdir -p auth_ig
chmod 700 auth_ig
echo "Instagram Python adapter terpasang: $(.venv-instagram/bin/python -c 'from importlib.metadata import version; print(version("instagrapi"))')"
