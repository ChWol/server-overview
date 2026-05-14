#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
APP_NAME="Server Overview Bar"
BUILD_DIR="$SCRIPT_DIR/build"
APP_DIR="$BUILD_DIR/$APP_NAME.app"
MACOS_DIR="$APP_DIR/Contents/MacOS"

rm -rf "$APP_DIR"
mkdir -p "$MACOS_DIR"
cp "$SCRIPT_DIR/Info.plist" "$APP_DIR/Contents/Info.plist"

swiftc \
  "$SCRIPT_DIR/MenuBarApp.swift" \
  -framework Cocoa \
  -framework Network \
  -o "$MACOS_DIR/ServerOverviewBar"

echo "Built $APP_DIR"
