#!/usr/bin/env bash
# curl -fsSL https://raw.githubusercontent.com/GGtheKitty/walltaker/refs/heads/main/scripts/install.sh | bash

set -euo pipefail

BRANCH="${1:-main}"
INSTALL_DIR="${2:-/opt/walltaker}"
RAW_REPO="${RAW_REPO:-https://raw.githubusercontent.com/GGtheKitty/walltaker/$BRANCH}"

mkdir -p "$INSTALL_DIR/scripts"

curl -fsSL "$RAW_REPO/Makefile" -o "$INSTALL_DIR/Makefile"
curl -fsSL "$RAW_REPO/.env.example" -o "$INSTALL_DIR/.env.example"
touch "$INSTALL_DIR/walltaker.env"

curl -fsSL "$RAW_REPO/scripts/install.sh" -o "$INSTALL_DIR/scripts/install.sh"
curl -fsSL "$RAW_REPO/scripts/deploy.sh" -o "$INSTALL_DIR/scripts/deploy.sh"

chmod +x "$INSTALL_DIR/scripts/"*.sh

echo "Installed to $INSTALL_DIR"
