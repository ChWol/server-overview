#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

if [ ! -d "macos/ServerOverviewBar/build/Server Overview Bar.app" ]; then
  bash macos/ServerOverviewBar/build.sh
fi

open "macos/ServerOverviewBar/build/Server Overview Bar.app"
