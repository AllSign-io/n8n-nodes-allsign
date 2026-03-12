#!/bin/bash
# ============================================================
# AllSign n8n Node — Dev Script (with hot reload)
# Builds, links, and starts n8n. Auto-restarts on .ts changes.
# Usage: ./dev.sh   or   npm start
# ============================================================

set -e

PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"
N8N_CUSTOM="$HOME/.n8n/custom"
LINK="$N8N_CUSTOM/node_modules/n8n-nodes-allsign"

echo ""
echo "🔧 AllSign n8n Node — Dev Mode (hot reload)"
echo "============================================="

# --- Clean ALL duplicate installs (keep only custom/ symlink) ---
rm -f  "$HOME/.n8n/node_modules/n8n-nodes-allsign" 2>/dev/null
rm -rf "$HOME/.n8n/nodes/node_modules/n8n-nodes-allsign" 2>/dev/null
rm -rf "$HOME/.npm-global/lib/node_modules/n8n-nodes-allsign" 2>/dev/null
rm -rf "$HOME/.npm-global/lib/node_modules/n8n/node_modules/n8n-nodes-allsign" 2>/dev/null

# Clean file: dependency from custom/package.json if present
if grep -q "n8n-nodes-allsign" "$N8N_CUSTOM/package.json" 2>/dev/null; then
    cd "$N8N_CUSTOM" && npm uninstall n8n-nodes-allsign 2>/dev/null || true
    cd "$PROJECT_DIR"
fi

# --- Ensure symlink ---
mkdir -p "$N8N_CUSTOM/node_modules"
if [ ! -L "$LINK" ]; then
    ln -s "$PROJECT_DIR" "$LINK"
fi
echo "✓ Node linked"

# --- Build ---
echo ""
echo "📦 Building..."
npm run build

# --- Start with hot reload ---
echo ""
echo "🚀 Starting n8n with hot reload..."
echo "   Editor: http://localhost:5678"
echo "   Watching .ts files — auto-rebuilds on save"
echo ""

npx -y nodemon --watch nodes/ --watch credentials/ --ext ts --delay 1 --signal SIGTERM --exec "npm run build && n8n start"
