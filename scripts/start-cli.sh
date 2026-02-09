#!/bin/bash
#
# Start Jacques CLI
#
# This script starts the Jacques CLI TUI.
# Press 'q' or Ctrl+C to quit.
#

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

cd "$PROJECT_DIR/cli"

# Check if built
if [ ! -f "dist/cli.js" ]; then
    echo "CLI not built. Building..."
    npm run build
fi

# Check if GUI is built
if [ ! -f "$PROJECT_DIR/gui/dist/index.html" ]; then
    echo "GUI not built. Building..."
    cd "$PROJECT_DIR" && npm run build:gui
    cd "$PROJECT_DIR/cli"
fi

# Check if server is running
if [ ! -S /tmp/jacques.sock ]; then
    echo "Warning: Jacques server doesn't appear to be running."
    echo "Start it with: npm run start:server"
    echo ""
    read -p "Continue anyway? (y/N): " answer
    if [[ ! "$answer" =~ ^[Yy]$ ]]; then
        exit 1
    fi
fi

exec node dist/cli.js "$@"
