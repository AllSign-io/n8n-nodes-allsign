#!/bin/bash
# ============================================================
# AllSign n8n Node — Dev Script (with hot reload)
# Builds, links, and starts n8n. Auto-restarts on .ts changes.
# Usage: ./dev.sh   or   npm start
# ============================================================

set -e

PROJECT_DIR="$(cd "$(dirname "$0")" && pwd -P)"
cd "$PROJECT_DIR"

resolved() { (CDPATH= cd "$1" 2>/dev/null && pwd -P); }

es_este_repo() { [ "$(resolved "$1")" = "$PROJECT_DIR" ]; }

quitar_si_no_es_el_repo() {
    { [ -e "$1" ] || [ -L "$1" ]; } || return 0
    es_este_repo "$1" && return 0
    rm -rf "$1"
}

echo ""
echo "🔧 AllSign n8n Node — Dev Mode (hot reload)"
echo "============================================="

# --- Clean stale installs (only these locations) ---
quitar_si_no_es_el_repo "$HOME/.n8n/node_modules/n8n-nodes-allsign"
quitar_si_no_es_el_repo "$HOME/.npm-global/lib/node_modules/n8n-nodes-allsign"
quitar_si_no_es_el_repo "$HOME/.npm-global/lib/node_modules/n8n/node_modules/n8n-nodes-allsign"
quitar_si_no_es_el_repo "$HOME/.n8n/custom/node_modules/n8n-nodes-allsign"

# --- Ensure symlink in ~/.n8n/nodes/ (where n8n 2.x loads community nodes) ---
N8N_NODES="$HOME/.n8n/nodes"
LINK="$N8N_NODES/node_modules/n8n-nodes-allsign"
mkdir -p "$N8N_NODES/node_modules"
if ! es_este_repo "$LINK"; then
    if [ -e "$LINK" ] || [ -L "$LINK" ]; then
        echo "⚠️  $LINK no apunta a este repo — se reemplaza"
        echo "    Si lo dejó npm: cd ~/.n8n/nodes && npm uninstall n8n-nodes-allsign"
        quitar_si_no_es_el_repo "$LINK"
    fi
    ln -s "$PROJECT_DIR" "$LINK"
    if ! es_este_repo "$LINK"; then
        echo "✗ No se pudo enlazar el nodo en $LINK"
        exit 1
    fi
fi
echo "✓ Node linked -> $PROJECT_DIR"

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
