#!/usr/bin/env bash
set -euo pipefail

echo "==> Building solution"

npm run compile
dotnet build src/miniscript-cli/miniscript-cli.csproj -c Debug

echo "==> Build complete"