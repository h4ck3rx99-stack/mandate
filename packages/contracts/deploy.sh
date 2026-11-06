#!/usr/bin/env bash
# Runs inside WSL: loads repo .env (CRLF-safe) and deploys RevocationRegistry to Sepolia.
set -euo pipefail
cd "$(dirname "$0")"
set -a; eval "$(tr -d '\r' < ../../.env | grep -E '^[A-Z0-9_]+=')"; set +a
~/.foundry/bin/forge script script/Deploy.s.sol --rpc-url "$SEPOLIA_RPC_URL" --broadcast
