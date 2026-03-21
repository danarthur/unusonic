#!/usr/bin/env bash
# Fix ENOTEMPTY / corrupted node_modules: remove and reinstall.
set -e
cd "$(dirname "$0")/.."
echo "Removing node_modules and .next..."
rm -rf node_modules .next
echo "Running npm install..."
npm install
echo "Done. Run 'npm run build' to verify."
