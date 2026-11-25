# Changelog

All notable changes to `n8n-nodes-allsign` will be documented in this file.

## [0.9.0] — 2026-11-25

Changes requested by n8n's review for verification.

### ✨ Changed

- **List Documents has Return All.** Turn it on and the node follows the pages for you until every matching document is fetched; leave it off and **Limit** applies. Each document now comes out as its own item, as with other n8n list operations, instead of one item holding the whole page.
- **Optional fields live in collections.** Send, Void and Remind have an **Options** collection with **Idempotency Key** (all three) and **Reason** (Void). **Template Values** moved into Create's **Configuration**, and the Trigger's endpoint **Description** into its own **Options**. Only required fields stay at the top of the form.

### ⚠️ Upgrading from 0.7.x or 0.8.x

- If you set **Template Values**, an **Idempotency Key** on Send, Void or Remind, a **Reason**, or the Trigger **Description**, open the node and set it again in its new collection. Workflows on the verified 0.1.5 are not affected: those fields did not exist there.
- **Starting After**, **Ending Before** and **Include Total** were removed from List Documents' filters. Use **Return All** instead of paging by hand.
- List Documents returns one item per document. A workflow that read `data` from the list output now reads each item directly.
- The example workflows in `examples/` use the new layout.

## [0.8.0] — 2026-11-25

### 🐛 Fixed

- **A second Create node, or a second loop run, now creates its own document.** The `Idempotency-Key` the node sends on every write was derived from the execution, item, operation and document, but not from the node or the loop run. Two Create nodes in the same workflow, or `Loop Over Items`, sent the same key to the same route, and the API replayed the first document instead of creating the second one, or answered `409` if the body differed. The key now includes the node id and `$runIndex`. n8n's own retries of the same node, run and item still reuse their key, so they never duplicate a document.
- **Your own Idempotency Key can be any text.** The API only accepts a UUID v4, so the suggested `order-4821-create` failed with `400 IDEMPOTENCY_KEY_INVALID`. Any text you enter is now turned into a stable UUID v4, and a value that is already a UUID v4 is sent as is.
- **The Trigger no longer leaves orphan endpoints when the n8n URL changes.** Restarting a tunnel or changing `WEBHOOK_URL` made the Trigger forget its endpoint and register a new one. The old one stayed alive, failing on every delivery and counting toward the limit of 25 per environment, until activation failed with `WEBHOOK_LIMIT_EXCEEDED`. When only the host changes and the webhook path is the same, the Trigger now updates the existing endpoint's URL and keeps its id and secret. An endpoint with a different path is still left alone, because it may belong to an imported workflow.
- **The credential test works with webhook-only API keys.** It called `/v3/documents`, which requires `document:read`, so a key with only webhook scopes failed the test. It now calls `/v3/users/me`, which answers for any valid key.

### 🌐 Interface

- **The whole interface is in English**, as n8n requires for verified nodes. "Handwritten Signature (Autografa)" is now "Handwritten Signature", "NOM-151 constancia" is now "NOM-151 certificate", and the examples use `supplier`, `full_name` and `amount`. A test checks every label, description and placeholder of both nodes and the credential.

## [0.7.0] — 2026-10-20

### ✨ Added

- **AllSign Trigger** — a trigger node, so a workflow can *start* from AllSign instead of only acting on it. Until now the node could create and send documents, but nothing in n8n knew when one got signed: you had to poll, or wire a bare Webhook node and verify the signature by hand. The Trigger registers its own endpoint through `POST /v3/webhooks` when the workflow is activated and removes it on deactivation, so there is nothing to set up in the AllSign dashboard. The event list is loaded live from `GET /v3/webhooks/events`, which means a new AllSign event shows up in the dropdown without shipping a release.
- **Standard Webhooks signature verification** — every delivery is checked against `{webhook-id}.{webhook-timestamp}.{raw body}` with an HMAC, in constant time, and replays older than five minutes are rejected. Implemented in-tree rather than through a dependency: it is fifteen lines, and a community node with extra packages is a bigger ask of n8n's review.
- **The endpoint survives the things that go wrong around it.** It is looked up by id rather than searched for in a list, which only returns the twenty most recent — in a busier account the node would have missed its own endpoint and registered a second one against the same URL, and the first would have kept signing with a secret n8n no longer had. A 500 or a dropped connection counts as "unknown", not "gone". An endpoint the circuit breaker disabled is reactivated, keeping its id and secret. A reused endpoint gets the node's current events, so an endpoint that outlived a failed deactivation doesn't keep listening to the old ones. One that points somewhere else is left alone, because it may belong to a workflow someone imported.
- **Deactivating never leaves an endpoint behind without saying so.** Only a 404 is ignored when removing; any other failure is raised, which keeps the id so the next activation reuses it instead of orphaning the old endpoint.

### 🔐 Credentials

- The AllSign API key used by the Trigger needs `webhook:read`, `webhook:write` and `webhook:delete` on top of `document:*`. The scopes are checked when you activate the workflow — the one moment n8n shows the error on screen — and the message names the ones that are missing.

### 🐛 Fixed

- **Documentation links no longer lead to a dead domain.** `docs.allsign.io` doesn't resolve, and it was the first thing someone who had just installed the node ran into: the credential description and the node catalog pointed there. They now go to `allsign.io/developers/docs`. A test checks that the credential, the catalog and the example workflow only point to `allsign.io` or `api.allsign.io`, and a CI step covers what the test can't read, such as the README.
- **The package passes the scanner n8n runs before verifying a community node.** n8n lints two things: the published tarball, and the source of the commit that the npm provenance attests — tests included, with `eslint-disable` comments ignored. The source had eight errors that only the second pass sees. *List Documents* now defaults `Limit` to 50 with n8n's standard description (the API accepts 1–100 either way, and the node always sends the value), a validation error raised inside the node is re-thrown as a `NodeOperationError`, test fixtures no longer look like real API keys, and the download of a file by URL lives in its own function so it isn't read as hand-rolled authentication. The build no longer emits `.d.ts` files, which the package never needed.
- **`npm run scan` runs both of n8n's passes** with the scanner version pinned, and CI and the publish workflow run it, so a release that would fail verification fails before it reaches npm — a published version can't be replaced.

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

