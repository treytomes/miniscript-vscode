#!/usr/bin/env bash
set -euo pipefail

echo "==> Publishing miniscript-cli"
dotnet publish src/miniscript-cli/miniscript-cli.csproj -c Debug

echo
echo "==> Publish complete"
echo "miniscript-cli -> dist/miniscript-cli"
