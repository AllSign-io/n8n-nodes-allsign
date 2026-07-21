# Changelog

All notable changes to `n8n-nodes-allsign` will be documented in this file.

## [0.2.0] — 2026-07-21

### 🔄 Changed

- **Migrate Create Document to AllSign API v3** (single-call create with inline signers + signature validation) — replaces the v2 multi-step orchestration (`POST /v2/documents/` → `/add-signer` → `/signature-fields` → `/invite-bulk`) with one `POST /v3/documents` request.
- **Source: File or Template** — new top-level "Source" selector. File keeps the existing Binary/URL input; Template references an existing AllSign template by ID and fills in `Template Values`.
- **Signers** — now sent inline (`signers[]`) at creation time; added optional **Role Name** per signer for auto-assigning template variables.
- **Signature Validations** — reduced to v3's curated 6-flag subset (Autógrafa, NOM-151, FEA, Biometric Selfie, ID Scan, Video Signature). eIDAS, Confirm Name, Identity Verification, and SynthID are not part of the v3 create contract and were removed.
- **Idempotency Key** — new optional field in Configuration, sent as the `Idempotency-Key` header.
- **Credential test** — now validates the API key against `GET /v3/documents?limit=1` instead of the deprecated `/v2/test/security`.

### 🗑️ Removed

- Signature Field placement (coordinates/anchor text) — not part of the v3 create body; fields are positioned after creation in a future operation.
- Permissions (owner email, collaborators, public read) and Folder (ID/name) — not part of the v3 create body.
- Send Invitations toggle — v3 dispatches invitations to inline signers as part of document creation.

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

