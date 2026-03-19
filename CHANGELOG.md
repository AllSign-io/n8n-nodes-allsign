# Changelog

All notable changes to `n8n-nodes-allsign` will be documented in this file.

## [0.1.0] — 2026-03-19

### ✨ Added

- **Create & Send** — Single-operation node: upload PDF + send for signing in one step
- **Signers** — Email or WhatsApp delivery per signer, with dual OTP when both provided
- **10 Signature Validations** — Autógrafa, FEA, eIDAS, NOM-151, Video, Biometric Selfie, SynthID, ID Scan, Identity Verification, Confirm Name
- **Signature Field Placement** — Coordinates (X, Y) or Anchor Text modes, with All Pages option
- **Template Variables (DOCX)** — Replace `{{ variables }}` in DOCX templates with dynamic values
- **Expires At** — Set expiration deadlines for documents
- **Permissions** — Owner email, collaborators, and public read options
- **Folders** — Organize documents by Folder ID or Folder Name
- **File Input** — Binary (from any n8n node) or URL (with auto-convert for Google Drive & Dropbox links)
- **AI Agent compatible** — `usableAsTool: true` for n8n AI workflows
- **NDA Workflow Template** — Complete n8n workflow example in `examples/`
- **NDA DOCX Template** — Professional bilingual NDA with 6 template variables

### 🔐 Credentials

- API Key authentication (Bearer token)
- Configurable Base URL (default: `https://api.allsign.io`)
- Built-in connection test via `/v2/test/security`

### ✅ Quality

- 39 unit tests (Jest, fully mocked)
- CI pipeline (GitHub Actions: test + lint + build)
- Bilingual README (English/Spanish)

