# Changelog

All notable changes to `n8n-nodes-allsign` will be documented in this file.

## [0.1.0] — 2026-03-11

### ✨ Added

- **eIDAS signature validation** — European Electronic Signature compliance toggle
- **Template Variables (DOCX)** — Replace `{{ variables }}` in DOCX templates with dynamic values
- **Expires At** — Set expiration deadlines for documents
- **Permissions** — Owner email, collaborators, and public read options
- **NDA Workflow Template** — Complete n8n workflow example in `examples/` (Form → DOCX Variables → AllSign)
- **NDA DOCX Template** — Professional bilingual NDA with 6 template variables

### 🔄 Changed

- **Simplified WhatsApp input** — Single `WhatsApp` field replaces 3-field (Country Code + Custom Code + Phone) setup
- **Autógrafa moved** — Now inside Signature Validations collection (from standalone toggle)
- **32 codex aliases** — Added `whatsapp`, `nda`, `template`, `docx` for marketplace discoverability
- **38 unit tests** — Up from 25, covering all new features

## [1.0.0-mvp.3] — 2026-02-26

### 🔧 Fixed

- **Tests updated** — Aligned all 25 tests with the 2-step invite-bulk flow
- **HANDOVER.md** — Updated to reflect current MVP state

## [1.0.0-mvp.2] — 2026-02-23

### ✨ Added

- **WhatsApp invitations** — Added `sendByWhatsapp` config and WhatsApp field per signer
- **Signature field placement** — Support for coordinates (X, Y, page) and anchor text modes
- **invite-bulk flow** — 2-step document creation: create doc → send invitations via `/invite-bulk`

### 🔄 Changed

- **Document creation flow** — Now creates document with `sendInvitations: false` and sends invitations separately via invite-bulk endpoint for proper GuestSession flow

## [1.0.0-mvp.1] — 2026-02-20

### ✨ Added

- **Autógrafa toggle** — Converted signature type dropdown to boolean toggle
- **Cleaned UI** — Removed unsupported Templates and Message fields
- Full test suite rewrite (25 tests, 100% pass rate)

## [1.0.0-mvp.0] — 2026-02-18

### 🎉 Initial MVP Release

#### AllSign Node — Create & Send (1 operation)

- Upload PDF from URL or binary input
- Send for signing with configurable signature requirements
- Support for 7 signature types: Autógrafa, FEA, NOM-151, Video, Confirm Name, ID Scan, Biometric Selfie + SynthID
- Multiple signers in a single request
- V2 API with Bearer token authentication

#### AllSign Trigger (4 webhook events)

- `document.completed` — All signers have signed
- `document.sent` — Document was sent for signing
- `document.signed` — Individual signer completed
- `document.voided` — Document was voided/cancelled
- HMAC-SHA256 signature validation support

#### Credentials

- API Key authentication (Bearer token)
- Configurable Base URL (production or custom)
- Built-in connection test via `/v2/test/security`
