#!/usr/bin/env bash
set -euo pipefail
install_branch="${1:-node}"
install_dir="${2:-/opt/walltaker}"
git clone --branch "$install_branch" https://github.com/GGtheKitty/walltaker.git "$install_dir"
cd "$install_dir"
cp .env.example walltaker.env
chmod 600 walltaker.env
printf 'Edit %s/walltaker.env with private credentials, then run make deploy.\n' "$install_dir"
