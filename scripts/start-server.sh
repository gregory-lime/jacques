#!/bin/bash
#
# Start Jacques Server
#
# This script starts the Jacques server in the foreground.
# Use Ctrl+C to stop.
#

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

cd "$PROJECT_DIR/server"

# Check if already running
if [ -S /tmp/jacques.sock ]; then
    echo "Warning: Jacques socket already exists at /tmp/jacques.sock"
    echo "Another server may be running, or a stale socket exists."
    echo ""
    read -p "Remove socket and continue? (y/N): " answer
    if [[ "$answer" =~ ^[Yy]$ ]]; then
        rm /tmp/jacques.sock
    else
        exit 1
    fi
fi

# Check if built
if [ ! -f "dist/server.js" ]; then
    echo "Server not built. Building..."
    npm run build
fi

# Check if GUI is built
if [ ! -f "$PROJECT_DIR/gui/dist/index.html" ]; then
    echo "GUI not built. Building..."
    cd "$PROJECT_DIR" && npm run build:gui
    cd "$PROJECT_DIR/server"
fi

echo ""
echo "Starting Jacques server..."
echo "Press Ctrl+C to stop"
echo ""

exec node dist/server.js
