# n8n-nodes-allsign

![AllSign](https://img.shields.io/badge/AllSign-E--Signature-6C5CE7?style=for-the-badge)
![n8n](https://img.shields.io/badge/n8n-Integration-FF6D5A?style=for-the-badge)
![License](https://img.shields.io/badge/License-MIT-green?style=for-the-badge)

[n8n](https://n8n.io) integration for the **[AllSign](https://allsign.io)** e-signature platform.

Create and send documents for electronic signature directly from your n8n workflows using the AllSign API V2.

---

## ✨ Features

### 📄 Document — Create & Send

Upload a PDF or DOCX (from URL or binary input) and send it for signing in one step, with full control over signature requirements.

### 📱 Signers: Email & WhatsApp

Signers can be reached via **email**, **WhatsApp**, or **both**. When both channels are provided, the signer verifies their identity through OTP on both channels as part of the signing process.

- ✅ Email-only signers
- ✅ WhatsApp-only signers (phone number, no email required)
- ✅ Both channels — dual OTP verification during signing

### 🔐 10 Signature Validations

| Validation                 | Description                                                          |
| -------------------------- | -------------------------------------------------------------------- |
| **Autógrafa**              | Handwritten digital signature with biometric capture (on by default) |
| **FEA**                    | Advanced Electronic Signature — Mexico standard                      |
| **eIDAS**                  | European Electronic Signature — eIDAS compliance                     |
| **NOM-151**                | NOM-151-SCFI certified timestamping (Mexico)                         |
| **Video Signature**        | Recorded video of the signer during the signing process              |
| **Biometric Selfie**       | Face comparison against the signer's government ID                   |
| **SynthID (AI Detection)** | Verifies selfie is from a real person, not AI-generated              |
| **ID Scan**                | Government-issued ID scan (INE, passport, etc.)                      |
| **Identity Verification**  | AI-powered ID + selfie verification pipeline                         |
| **Confirm Name**           | Signer must type their full name as confirmation                     |

### 📥 File Input

- **Binary Input** — Use a file from a previous node (e.g. Google Drive, HTTP Request, Dropbox)
- **URL** — Provide a public URL to a PDF or DOCX file (Google Drive and Dropbox links are auto-converted)

### 📐 Signature Field Placement

Place signature fields precisely on the document:

- **By coordinates** — X, Y position on a specific page (or all pages)
- **By anchor text** — Search for text in the PDF and place the field there

### ⚙️ Additional Options

| Option                       | Description                                                         |
| ---------------------------- | ------------------------------------------------------------------- |
| **Folder**                   | Organize documents into folders (by name or ID)                     |
| **Expires At**               | Set an expiration deadline — document auto-expires after this date  |
| **Template Variables (DOCX)**| Replace `{{ variables }}` in DOCX templates with dynamic values     |
| **Permissions**              | Set document owner, collaborators, and public read access           |
| **Send Invitations**         | Auto-send or hold for manual sharing                                |

---

## 🚀 Getting Started

### 1. Configure Credentials

1. In n8n, go to **Credentials → Add Credential → AllSign API**
2. Enter your **API Key** — get one from [dashboard.allsign.io/developers/api-keys](https://dashboard.allsign.io/developers/api-keys)
3. (Optional) Set the **Base URL** if using a custom environment (default: `https://api.allsign.io`)
4. Click **Save** — the connection test validates your key automatically

### 2. Use the Node

1. Add the **AllSign** node to your workflow
2. Set the document name and file source (URL or Binary)
3. Add signers (name + email and/or WhatsApp number)
4. Toggle the signature validations you need
5. Execute!

The signing invitation channel (email or WhatsApp) is auto-detected per signer based on the contact information provided.

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
| `npm test`            | Run unit tests (39 tests)    |
| `npm run lint`        | Check code style             |

### Project Structure

```
n8n-nodes-allsign/
├── credentials/
│   └── AllSignApi.credentials.ts        # API Key + Base URL credential
├── nodes/
│   └── Allsign/
│       ├── Allsign.node.ts              # Main node (Create & Send)
│       ├── Allsign.node.json            # Codex metadata & SEO
│       ├── Allsign.node.test.ts         # Unit tests (39 tests)
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
