#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
scripts/build
scripts/compose up -d database redis
scripts/compose run --rm migrate
scripts/compose up -d
