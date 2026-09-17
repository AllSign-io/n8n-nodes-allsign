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

# --- Clean stale installs (only these locations) ---
rm -f  "$HOME/.n8n/node_modules/n8n-nodes-allsign" 2>/dev/null
rm -rf "$HOME/.npm-global/lib/node_modules/n8n-nodes-allsign" 2>/dev/null
rm -rf "$HOME/.npm-global/lib/node_modules/n8n/node_modules/n8n-nodes-allsign" 2>/dev/null
rm -rf "$HOME/.n8n/custom/node_modules/n8n-nodes-allsign" 2>/dev/null

# --- Ensure symlink in ~/.n8n/nodes/ (where n8n 2.x loads community nodes) ---
N8N_NODES="$HOME/.n8n/nodes"
LINK="$N8N_NODES/node_modules/n8n-nodes-allsign"
mkdir -p "$N8N_NODES/node_modules"
# Si hay algo que NO sea nuestro symlink (p.ej. un directorio real que dejó
# `npm install n8n-nodes-allsign`), se quita: si no, `ln -sf` mete el enlace
# ADENTRO del directorio y n8n sigue cargando la versión vieja de npm.
if [ -e "$LINK" ] || [ -L "$LINK" ]; then
    if [ "$(readlink "$LINK")" != "$PROJECT_DIR" ]; then
        echo "⚠️  $LINK no apunta a este repo — se reemplaza"
        rm -rf "$LINK"
    fi
fi
[ -L "$LINK" ] || ln -s "$PROJECT_DIR" "$LINK"
# Verificar de verdad, no confiar en que ln no falló.
if [ "$(readlink "$LINK")" != "$PROJECT_DIR" ]; then
    echo "✗ No se pudo enlazar el nodo: $LINK -> $(readlink "$LINK" || echo '(nada)')"
    exit 1
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
