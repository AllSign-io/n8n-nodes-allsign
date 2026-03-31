---
description: how to run the n8n node locally for development
---

# Run AllSign n8n Node Locally

## Quick Start (one command)

// turbo
1. Run the dev script from the project root:
```bash
npm start
```

This single command does everything:
- ✅ Builds the TypeScript node
- ✅ Links it to n8n (in `~/.n8n/custom/node_modules/`)
- ✅ Cleans up any duplicate symlinks
- ✅ Starts n8n on http://localhost:5678

## After making code changes

// turbo
1. Stop n8n with `Ctrl+C`, then run again:
```bash
npm start
```

## Running tests

// turbo
1. Run the test suite:
```bash
npm test
```

## Login Credentials (local n8n)

- **Email:** `erikasofia.garciabalderas@gmail.com`
- **Password:** `!Bz!nt$t$4`

## Notes

- The node is linked via symlink from `~/.n8n/custom/node_modules/n8n-nodes-allsign` → project directory
- n8n discovers it automatically from the `n8n` field in `package.json`
- If you ever see **two AllSign nodes** in n8n, run `./dev.sh` — it automatically cleans duplicate symlinks
