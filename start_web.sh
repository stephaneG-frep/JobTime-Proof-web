#!/usr/bin/env bash
set -e
cd "$(dirname "$0")"
echo "JobTime Proof Web sur http://127.0.0.1:8080"
python3 -m http.server 8080
