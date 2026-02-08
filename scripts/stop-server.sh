#!/bin/bash
# Stop the Jacques server gracefully
#
# Tries PID file first, then falls back to finding processes on the HTTP port.
# Waits for graceful shutdown before force-killing.

PID_FILE="$HOME/.jacques/server.pid"
SOCKET="/tmp/jacques.sock"
HTTP_PORT=4243

stopped=false

# Try PID file first
if [ -f "$PID_FILE" ]; then
  PID=$(cat "$PID_FILE")
  if kill -0 "$PID" 2>/dev/null; then
    echo "Stopping Jacques server (PID: $PID)..."
    kill "$PID"
    # Wait up to 5s for graceful shutdown
    for i in $(seq 1 50); do
      kill -0 "$PID" 2>/dev/null || break
      sleep 0.1
    done
    # Force kill if still alive
    if kill -0 "$PID" 2>/dev/null; then
      echo "Force killing PID $PID..."
      kill -9 "$PID"
      sleep 0.5
    fi
    stopped=true
  fi
  rm -f "$PID_FILE"
fi

# Fallback: kill anything on the HTTP port
PORT_PID=$(lsof -ti :$HTTP_PORT 2>/dev/null)
if [ -n "$PORT_PID" ]; then
  echo "Killing process on port $HTTP_PORT (PID: $PORT_PID)..."
  kill "$PORT_PID" 2>/dev/null
  sleep 1
  kill -9 "$PORT_PID" 2>/dev/null
  stopped=true
fi

# Clean up stale socket
if [ -e "$SOCKET" ]; then
  rm -f "$SOCKET"
fi

if [ "$stopped" = true ]; then
  echo "Server stopped."
else
  echo "No server running."
fi
