# Changelog

All notable changes to `n8n-nodes-allsign` will be documented in this file.

## [0.6.0] — 2026-08-26

### 🐛 Fixed

- **An n8n retry no longer creates a second document and charges again.** The `Idempotency-Key` was
  generated with `randomUUID()`, so a `POST` that timed out and was retried by n8n arrived with a
  fresh key and the API treated it as a brand-new send — a duplicate document, billed again. The key
  is now derived deterministically from the execution ID, the item index, the operation and the
  document ID, so a retry replays instead of duplicating. (Passing `executionId + itemIndex`
  verbatim isn't enough: `POST /v3/documents` validates the header as a UUID, so the parts are
  hashed into one.)
- **File name and type are read before the query string.** A Dropbox link (`…/nda.docx?dl=1`) or an
  S3 presigned URL (`…/file.docx?X-Amz-…`) doesn't end in `.docx`, so the upload was typed as `pdf`.
  Query and hash are now stripped before the type and name are inferred.
- **`Template Values` from an expression no longer fails as "invalid JSON".** An expression yields an
  object; the node handled it as text and rejected the user's correct data.
- **`Limit` and cursors are validated in the node.** `Limit` is held to 1–100 even when set by an
  expression (the form already did, expressions bypassed it), and passing `Starting After` together
  with `Ending Before` now fails in the node with a clear message instead of returning an opaque
  `422`.
- **API errors explain themselves.** n8n surfaces only `message` and `description`, so the `detail`,
  the stable `code` and the `requestId` that support needs to trace a call stayed invisible inside
  the `problem+json` response body. They are now shown — including when the body arrives unparsed as
  a string, which happens when the parser doesn't recognize `application/problem+json`. A body that
  isn't JSON is never echoed raw.
- **The example NDA workflow no longer leaves a draft nobody ever signs** — it now sends the document
  after creating it.
- **Every output says which input item it came from.** Outputs carried no `pairedItem`, so in a run
  over N items n8n couldn't trace a result back to its row — including the error outputs produced
  under "Continue on Fail". All eight operations now set it.
- **Document and signer IDs are escaped into the URL.** They are interpolated into the path, so an
  id carrying a `/` or any reserved character silently produced a different route. Both are now
  `encodeURIComponent`-escaped.
- **The package no longer advertises eIDAS.** AllSign covers NOM-151 and FEA (Mexico); eIDAS is the
  European framework and isn't supported. It was listed in the npm keywords and in the package
  description — the line npm renders under the package name — which brought the wrong integrator.

### 🔄 Changed

- **`engines.node` is declared (`>=22`).** Required by the n8n verification guidelines, and without
  it npm warns nobody that the node won't run on an older Node.

### ✅ Verification

102 unit tests, lint and build green. Every fix above is mutation-verified: reverting the fix turns
its test red.

### 🔄 Changed

- **Restructure to n8n Resource + Operation pattern (Document resource)** — added a `Resource` selector (`Document`, the only value) as the node's first field, with `Operation` and all 17 operation-specific fields now also gated on `resource: ['document']` in addition to their existing `operation` conditions. This is a pure UI/organization change — `execute()` still routes purely on `operation`, and every request body/query/header produced is unchanged. Resolves the n8n lint warning `@n8n/community-nodes/resource-operation-pattern` ("8 operations without resources"), which is now fully clear (0 errors, 0 warnings).

### ✨ Added

Five new operations (Tier 2), bringing the node to 8 operations total:

- **List Documents** (`GET /v3/documents`) — read-only, paginated. `Limit` (1-100, default 20) plus an optional `Filters` collection: Status, Scope, Search, Starting After, Ending Before, Folder ID, Include Total. Only the filters you set are sent.
- **List Signers** (`GET /v3/documents/{documentId}/signers`) — read-only, returns a document's signers.
- **Get Evidence** (`GET /v3/documents/{documentId}/evidence`) — read-only, returns the evidence bundle (signed PDF + NOM-151 constancia, presigned URLs). `available` is `false` until every signer completes.
- **Void Document** (`POST /v3/documents/{documentId}/void`) — write. Optional `Reason`, omitted from the body when empty. Not a delete — NOM-151 retention keeps the voided record.
- **Remind Signer** (`POST /v3/documents/{documentId}/signers/{signerId}/remind`) — write, no request body (the endpoint doesn't take one). New required `Signer ID` field, visible only for this operation.

### 🔄 Changed

- `Document ID` is now shared across six operations (Send, Get, List Signers, Get Evidence, Void, Remind) via one property with an extended `displayOptions`.
- `Idempotency Key` (auto-generated UUID v4 when left empty) is now shared across all three write operations (Send, Void, Remind) via one property, generalized wording.
- Dynamic `subtitle` now covers all 8 operations via a lookup table.

### ✨ Added

- **Get Document operation** — new `Operation: Get Document` calls `GET /v3/documents/{documentId}` to retrieve a document by ID. Read-only: no request body, no `Idempotency-Key` header (doesn't apply to GET). The `Document ID` field is now shared between Send Document and Get Document.

## [0.3.1] — 2026-07-23

### 🐛 Fixed

- **Auto-generate Idempotency-Key when not provided** — the AllSign API rejects `POST /v3/documents` (Create) and `POST /v3/documents/{documentId}/send` (Send) with `400 IDEMPOTENCY_KEY_REQUIRED` if the header is missing. The node used to only send it when the optional field was filled in, so it failed out-of-the-box. Now, when the user leaves Idempotency Key empty, the node generates a random UUID v4 per item (via `node:crypto`'s `randomUUID()`) and sends it as the `Idempotency-Key` header. A user-provided key (for stable retries) is still respected as-is.

## [0.3.0] — 2026-07-23

### ✨ Added

- **Send Document operation** — new `Operation` selector (Create Document / Send Document) makes the node multi-operation. Send Document calls `POST /v3/documents/{documentId}/send`, which advances the document's state and dispatches the signing invitation.
- **Recipients (optional)** — a `fixedCollection` matching the Signers UX (Delivery Method: Email/WhatsApp, Name), mapped to `recipients[]` (camelCase `email`/`phone`/`name`). Leave empty to send to the signers already attached to the document — the backend falls back to them when `recipients` is omitted.
- **Idempotency Key** for Send Document, same pattern as Create Document (sent as the `Idempotency-Key` header).

### 🔄 Changed

- The node's `subtitle` is now dynamic (`Create Document` / `Send Document`) based on the selected operation.
- Existing Create Document fields (`Document Name`, `Source`, `Signers`, `Signature Validations`, `Configuration`, etc.) are unchanged in behavior — they're now gated behind `Operation = Create Document` for the UI, with no change to the request body they produce. All 38 existing Create Document tests still pass unmodified.

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

