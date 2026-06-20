#!/usr/bin/env bash
set -euo pipefail

AGENT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PLIST_PATH="$HOME/Library/LaunchAgents/com.multivendor.print-agent.plist"
NODE_PATH="$(command -v node || true)"
PORT="${MVP_PRINT_AGENT_PORT:-17658}"
PRINTER_NAME="${MVP_PRINTER_NAME:-}"
LABEL_PRINTER_NAME="${MVP_LABEL_PRINTER_NAME:-}"

if [[ -z "$NODE_PATH" ]]; then
  echo "Node.js is required. Install Node.js 18+ first, then rerun this script." >&2
  exit 1
fi

mkdir -p "$HOME/Library/LaunchAgents"

cat > "$PLIST_PATH" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.multivendor.print-agent</string>
  <key>ProgramArguments</key>
  <array>
    <string>$NODE_PATH</string>
    <string>$AGENT_DIR/server.js</string>
  </array>
  <key>WorkingDirectory</key>
  <string>$AGENT_DIR</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>MVP_PRINT_AGENT_PORT</key>
    <string>$PORT</string>
    <key>MVP_ALLOWED_ORIGINS</key>
    <string>http://localhost:3000,http://127.0.0.1:3000,https://app.example.com</string>
    <key>MVP_PRINTER_NAME</key>
    <string>$PRINTER_NAME</string>
    <key>MVP_LABEL_PRINTER_NAME</key>
    <string>$LABEL_PRINTER_NAME</string>
    <key>PATH</key>
    <string>/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin</string>
  </dict>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>StandardOutPath</key>
  <string>$AGENT_DIR/print-agent.log</string>
  <key>StandardErrorPath</key>
  <string>$AGENT_DIR/print-agent.err.log</string>
</dict>
</plist>
PLIST

launchctl unload "$PLIST_PATH" >/dev/null 2>&1 || true
launchctl load "$PLIST_PATH"

echo "Installed and started com.multivendor.print-agent"
echo "Health check: http://127.0.0.1:$PORT/health"
