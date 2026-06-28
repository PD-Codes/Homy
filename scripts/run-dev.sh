#!/usr/bin/env sh
# Run Homy from source — no pip install, no build/ or *.egg-info in the repo.
set -e
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
export PYTHONPATH="$ROOT"
export FLASK_ENV="${FLASK_ENV:-development}"
exec python -m homy.app "$@"
