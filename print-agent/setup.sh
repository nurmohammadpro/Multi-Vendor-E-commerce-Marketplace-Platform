#!/usr/bin/env bash
set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

echo ""
echo -e "${CYAN}============================================${NC}"
echo -e "${CYAN}  App Brainer — Silent Printer Setup${NC}"
echo -e "${CYAN}============================================${NC}"
echo ""

# ── Step 1: Check Node.js ──
echo -e "${YELLOW}[1/5]${NC} Checking Node.js..."
if ! command -v node &>/dev/null; then
    echo -e "${RED}Node.js not found.${NC} Install Node.js 18+ first:"
    echo "  brew install node"
    echo "  or download from https://nodejs.org"
    exit 1
fi
echo -e "  ${GREEN}✓${NC} Node.js $(node -v)"

# ── Step 2: Collect credentials ──
echo ""
echo -e "${YELLOW}[2/5]${NC} POS printer credentials"
echo ""
echo "  You need your store ID and an API token from Market One."
echo "  Open Market One in your browser, go to the POS page,"
echo "  and copy the Store ID and Auth Token."
echo ""

read -r -p "  Store UUID: " STORE_ID
read -r -p "  Auth Token: " AUTH_TOKEN
read -r -p "  Printer name [XP-Q80A]: " PRINTER_NAME
PRINTER_NAME="${PRINTER_NAME:-XP-Q80A}"

# ── Step 3: Verify printer ──
echo ""
echo -e "${YELLOW}[3/5]${NC} Verifying printer..."
if lpstat -p 2>/dev/null | grep -qi "$PRINTER_NAME"; then
    echo -e "  ${GREEN}✓${NC} Printer \"$PRINTER_NAME\" found."
else
    echo -e "  ${YELLOW}⚠${NC} Printer \"$PRINTER_NAME\" not found in CUPS."
    echo "  Add it via System Settings → Printers & Scanners first."
    echo "  Continuing anyway — you can set it up later."
fi

# ── Step 4: Install print agent ──
echo ""
echo -e "${YELLOW}[4/5]${NC} Installing print agent..."

AGENT_DIR="$(cd "$(dirname "$0")" && pwd)"
ENV_FILE="$AGENT_DIR/.env"

cat > "$ENV_FILE" <<EOF
MVP_PRINTER_NAME=$PRINTER_NAME
MVP_STORE_ID=$STORE_ID
MVP_AUTH_TOKEN=$AUTH_TOKEN
MVP_API_BASE_URL=https://api.merchflow.appbrainer.tech/v1
MVP_POLL_INTERVAL_MS=3000
EOF

echo -e "  ${GREEN}✓${NC} Environment saved to $ENV_FILE"

# Create LaunchAgent plist for auto-start
PLIST_DIR="$HOME/Library/LaunchAgents"
mkdir -p "$PLIST_DIR"
PLIST_FILE="$PLIST_DIR/com.merchflow.print-agent.plist"

cat > "$PLIST_FILE" <<PLISTEOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.merchflow.print-agent</string>
    <key>ProgramArguments</key>
    <array>
        <string>/usr/local/bin/node</string>
        <string>server.js</string>
    </array>
    <key>WorkingDirectory</key>
    <string>$AGENT_DIR</string>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
    <key>StandardOutPath</key>
    <string>$HOME/Library/Logs/marketone-print-agent.log</string>
    <key>StandardErrorPath</key>
    <string>$HOME/Library/Logs/marketone-print-agent.log</string>
    <key>EnvironmentVariables</key>
    <dict>
        <key>MVP_PRINTER_NAME</key>
        <string>$PRINTER_NAME</string>
        <key>MVP_STORE_ID</key>
        <string>$STORE_ID</string>
        <key>MVP_AUTH_TOKEN</key>
        <string>$AUTH_TOKEN</string>
        <key>MVP_API_BASE_URL</key>
        <string>https://api.merchflow.appbrainer.tech/v1</string>
        <key>MVP_POLL_INTERVAL_MS</key>
        <string>3000</string>
    </dict>
</dict>
</plist>
PLISTEOF

# Unload if already running, then load
launchctl unload "$PLIST_FILE" 2>/dev/null || true
launchctl load "$PLIST_FILE" 2>/dev/null

echo -e "  ${GREEN}✓${NC} LaunchAgent installed. Print agent starts automatically on login."

# Start immediately
cd "$AGENT_DIR"
nohup node server.js > /dev/null 2>&1 &
sleep 2

# ── Step 5: Test ──
echo ""
echo -e "${YELLOW}[5/5]${NC} Verifying print agent..."

if curl -sf http://127.0.0.1:17668/health > /dev/null 2>&1; then
    HEALTH=$(curl -s http://127.0.0.1:17668/health)
    echo -e "  ${GREEN}✓${NC} Print agent is running!"
    echo "  Health: $HEALTH"
else
    echo -e "  ${RED}✗${NC} Print agent failed to start. Check logs:"
    echo "  cat $HOME/Library/Logs/marketone-print-agent.log"
fi

echo ""
echo -e "${CYAN}============================================${NC}"
echo -e "  ${GREEN}Setup complete!${NC}"
echo ""
echo "  The print agent will:"
echo "  - Start automatically when you log in"
echo "  - Poll for new sales every 3 seconds"
echo "  - Print receipts silently on ${YELLOW}$PRINTER_NAME${NC}"
echo ""
echo "  To stop:  launchctl unload $PLIST_FILE"
echo "  To check: curl http://127.0.0.1:17668/health"
echo -e "${CYAN}============================================${NC}"
echo ""
