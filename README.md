# n8n-nodes-allsign

![AllSign](https://img.shields.io/badge/AllSign-E--Signature-6C5CE7?style=for-the-badge)
![n8n](https://img.shields.io/badge/n8n-Integration-FF6D5A?style=for-the-badge)
![License](https://img.shields.io/badge/License-MIT-green?style=for-the-badge)

[n8n](https://n8n.io) integration for the **[AllSign](https://allsign.io)** e-signature platform.

Create and send documents for electronic signature directly from your n8n workflows using the **AllSign API v3**. The node has two operations:

- **Create Document** — a single `POST /v3/documents` call with inline signers and signature validation (no separate add-signer/invite steps).
- **Send Document** — `POST /v3/documents/{documentId}/send`, to (re)send the invitation for a document that already exists, optionally overriding who receives it.

---

## ✨ Features

### 📄 Operation: Create Document

Create a document from an inline **File** (PDF/DOCX, URL or binary input) or from an existing AllSign **Template** (by ID + variable values) — signers and signature validation travel inline in the same request.

### 📱 Signers: Email & WhatsApp

Signers can be reached via **email** or **WhatsApp**. Each signer can also carry an optional **Role Name**, used to auto-assign template variables marked with that role.

- ✅ Email-only signers
- ✅ WhatsApp-only signers (phone number, no email required)
- ✅ Optional Role Name per signer

### 🔐 6 Signature Validations

| Validation           | Description                                                          |
| --------------------- | --------------------------------------------------------------------- |
| **Autógrafa**         | Handwritten digital signature (on by default)                         |
| **NOM-151**           | NOM-151-SCFI certified conservation timestamping (Mexico)              |
| **FEA**               | Advanced Electronic Signature — Mexico standard                       |
| **Biometric Selfie**  | Face comparison against the signer's government ID (anti-deepfake)    |
| **ID Scan**           | Government-issued ID scan (INE, passport, etc.)                       |
| **Video Signature**   | Recorded video of the signer during the signing process               |

### 📥 File Input (Source: File)

- **Binary Input** — Use a file from a previous node (e.g. Google Drive, HTTP Request, Dropbox)
- **URL** — Provide a public URL to a PDF or DOCX file (Google Drive and Dropbox links are auto-converted)

### 📑 Template Input (Source: Template)

Reference an existing AllSign template by **Template ID** and fill in its variables via **Template Values** (JSON, natural variable-name keys).

### ⚙️ Additional Options

| Option             | Description                                                            |
| ------------------- | ------------------------------------------------------------------------ |
| **Expires At**     | Set an expiration deadline — document auto-expires after this date       |
| **Idempotency Key**| Safely retry the create request without creating a duplicate document    |

### 📤 Operation: Send Document

Send (or resend) the signing invitation for a document that already exists.

| Field | Description |
|:---|:---|
| **Document ID** | The `doc_...` of the document to send (required) |
| **Recipients** (optional) | Overrides who receives the invitation — same Delivery Method (Email/WhatsApp) shape as Signers. Leave empty to send to the signers already attached to the document |
| **Idempotency Key** (optional) | Safely retry the send request without dispatching duplicate invitations |

---

## 🚀 Getting Started

### 1. Configure Credentials

1. In n8n, go to **Credentials → Add Credential → AllSign API**
2. Enter your **API Key** — get one from [dashboard.allsign.io/developers/api-keys](https://dashboard.allsign.io/developers/api-keys)
3. (Optional) Set the **Base URL** if using a custom environment (default: `https://api.allsign.io`)
4. Click **Save** — the connection test validates your key automatically

### 2. Use the Node

**To create a document:**
1. Add the **AllSign** node to your workflow, leave **Operation** as **Create Document**
2. Set the document name and Source (File — URL or Binary — or an existing Template)
3. Add signers (name + email and/or WhatsApp number)
4. Toggle the signature validations you need
5. Execute!

**To send an existing document:**
1. Add the **AllSign** node, set **Operation** to **Send Document**
2. Set the **Document ID** (e.g. from a previous Create Document node's output)
3. Optionally add Recipients to override who gets invited
4. Execute!

The signing invitation channel (email or WhatsApp) is auto-detected per signer/recipient based on the contact information provided.

---

## 🛠️ Development

For contributors and developers who want to modify or extend this node.

### Clone & Install

```bash
git clone https://github.com/AllSign-io/n8n-nodes-allsign.git
cd n8n-nodes-allsign
npm install
```

### Scripts

| Command               | Description                  |
| --------------------- | ---------------------------- |
| `npm run dev`         | Start n8n with hot reload    |
| `npm run build`       | Compile TypeScript → `dist/` |
| `npm run build:watch` | Compile in watch mode        |
| `npm test`            | Run unit tests               |
| `npm run lint`        | Check code style             |

### Project Structure

```
n8n-nodes-allsign/
├── credentials/
│   └── AllSignApi.credentials.ts        # API Key + Base URL credential
├── nodes/
│   └── Allsign/
│       ├── Allsign.node.ts              # Main node (Create Document + Send Document, v3)
│       ├── Allsign.node.json            # Codex metadata & SEO
│       ├── Allsign.node.test.ts         # Unit tests
│       └── allsign.svg                  # Node icon
├── examples/
│   ├── NDA_Automation_AllSign_Workflow.json  # Example workflow
│   └── NDA_Template_AllSign.docx            # DOCX template with variables
├── docs/
│   └── template-portal-description.md   # n8n template portal description
├── package.json
├── tsconfig.json
└── jest.config.js
```

---

## 🐛 Troubleshooting

| Problem                      | Solution                                   |
| ---------------------------- | ------------------------------------------ |
| Connection test fails        | Verify API Key and Base URL in credentials |
| "Service refused connection" | Check the Base URL matches your backend    |
| TypeScript errors (dev)      | Ensure Node.js v22+, run `npm install`     |

---

## 📚 Resources

- [AllSign Platform](https://allsign.io)
- [AllSign API Documentation](https://developers.allsign.io)
- [AllSign API Playground](https://developers.allsign.io/api-playground/create-document)
- [n8n Documentation](https://docs.n8n.io/)
- [n8n Community Forum](https://community.n8n.io/)

## 📄 License

[MIT](LICENSE.md)
