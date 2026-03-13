#!/usr/bin/env bash
set -euo pipefail

echo "==> Cleaning solution"
rm -r -f ./dist
rm -r -f ./src/miniscript-cli/bin
rm -r -f ./src/miniscript-cli/obj

echo "==> Clean complete"