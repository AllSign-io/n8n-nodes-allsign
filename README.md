# n8n-nodes-allsign

![AllSign](https://img.shields.io/badge/AllSign-E--Signature-6C5CE7?style=for-the-badge)
![n8n](https://img.shields.io/badge/n8n-Community%20Node-FF6D5A?style=for-the-badge)
![License](https://img.shields.io/badge/License-MIT-green?style=for-the-badge)

[n8n](https://n8n.io) community node for the **[AllSign](https://allsign.io)** e-signature platform.

Create and send documents for electronic signature directly from your n8n workflows using the AllSign API v2.

> **🇲🇽 Español:** Nodo comunitario de n8n para firma electrónica con AllSign. Crea y envía documentos a firmar desde workflows de n8n.

---

## ✨ Features / Características

### 📄 Document — Create & Send

Upload a PDF (from URL or binary input) and send it for signing in one step, with full control over signature requirements.

> **🇲🇽** Sube un PDF (por URL o desde otro nodo) y envíalo a firmar en un solo paso, con control total sobre las validaciones de firma.

### 🔐 7 Signature Types / Tipos de Firma

| Type                           | Description                                             |
| ------------------------------ | ------------------------------------------------------- |
| **Autógrafa**                  | Handwritten digital signature / Firma digital autógrafa |
| **FEA**                        | Firma Electrónica Avanzada (Mexico)                     |
| **NOM-151**                    | NOM-151-SCFI certified timestamping (Mexico)            |
| **Video Signature**            | Recorded video as part of signing                       |
| **Confirm Name**               | Signer must type their full name                        |
| **ID Scan**                    | Government-issued ID verification                       |
| **Biometric Selfie + SynthID** | Selfie verification + AI detection                      |

### 📥 File Input / Entrada de Archivo

- **Binary Input** — Use a file from a previous node (e.g. Google Drive, HTTP Request)
- **URL** — Provide a public URL to a PDF file

### 🔜 Coming Soon / Próximamente

- Get, List, Download, Delete documents
- Folders & Contacts management
- Webhook Triggers (document.signed, document.completed, etc.)
- Signer & Signature Field management

---

## 🚀 Getting Started / Cómo empezar

### Prerequisites / Prerrequisitos

| Tool        | Version  | Install                              |
| ----------- | -------- | ------------------------------------ |
| **Node.js** | v22+     | [nvm](https://github.com/nvm-sh/nvm) |
| **npm**     | Included | —                                    |

### 1. Install in n8n

```bash
# Community nodes (from n8n UI):
# Settings → Community Nodes → Install → n8n-nodes-allsign

# Or install manually:
npm install n8n-nodes-allsign
```

### 2. Configure Credentials

1. In n8n, go to **Credentials → Create Credential → AllSign API**
2. Enter your **API Key** (get one from [dashboard.allsign.io](https://dashboard.allsign.io))
3. Set the **Base URL** (default: `https://api.allsign.io`)
4. Click **Save** — the connection test will validate your key

### 3. Use the Node

1. Add the **AllSign** node to your workflow
2. Select operation: **Create & Send**
3. Set the document name and file source (URL or Binary)
4. Add signers (name + email)
5. Toggle the signature types you need
6. Execute!

---

## 🛠️ Development / Desarrollo

### Clone & Install

```bash
git clone https://github.com/allsign/n8n-nodes-allsign.git
cd n8n-nodes-allsign
npm install
```

### Scripts

| Command               | Description                  |
| --------------------- | ---------------------------- |
| `npm run dev`         | Start n8n with hot reload    |
| `npm run build`       | Compile TypeScript → `dist/` |
| `npm run build:watch` | Compile in watch mode        |
| `npm test`            | Run unit tests (25 tests)    |
| `npm run lint`        | Check code style             |

### ☁️ Cloudflare Tunnel (Remote Access / Acceso Remoto)

To expose your local n8n instance to the internet (useful for webhook testing with the AllSign backend):

> **🇲🇽** Para exponer tu instancia local de n8n al internet (útil para probar webhooks con el backend de AllSign):

```bash
cloudflared tunnel run --token eyJhIjoiMjkwN2U1OWYzYzRjOWY3NzgzODFmM2RmODFiZWFhYzMiLCJ0IjoiZTU3NjJlYjItNTEzZC00OGNlLTllN2UtNjU1YzE1MTBlNDE1IiwicyI6IlptVTRNekUyWXprdE56Z3dOeTAwT0RNNExUazJaV010WVdRNE1EWXpaakF3TTJSbSJ9
```

> **Note:** Requires `cloudflared` CLI installed. This creates a secure tunnel so external services can reach your `localhost:5678`.

---

## 📂 Project Structure

```
n8n-nodes-allsign/
├── credentials/
│   └── AllSignApi.credentials.ts    # API Key + Base URL credential
├── nodes/
│   └── Allsign/
│       ├── Allsign.node.ts          # Main node (Create & Send)
│       ├── Allsign.node.json        # Codex metadata & SEO
│       ├── Allsign.node.test.ts     # Unit tests (25 tests)
│       └── allsign.svg              # Node icon
├── package.json
├── tsconfig.json
└── jest.config.js
```

---

## 🐛 Troubleshooting

| Problem                      | Solution                                   |
| ---------------------------- | ------------------------------------------ |
| Node doesn't appear in n8n   | Run `npm install` then `npm run dev`       |
| TypeScript errors            | Ensure Node.js v22+, run `npm install`     |
| Connection test fails        | Verify API Key and Base URL in credentials |
| "Service refused connection" | Check the Base URL matches your backend    |

---

## 📚 Resources / Recursos

- [AllSign Platform](https://allsign.io)
- [AllSign API Docs](https://docs.allsign.io)
- [n8n Node Development Guide](https://docs.n8n.io/integrations/creating-nodes/)
- [n8n Community Forum](https://community.n8n.io/)

## 📄 License / Licencia

[MIT](LICENSE.md)
