# Release Notes - AllSign n8n Node v1.0.0 (MVP)

## Summary

Updated the AllSign node to support the V2 API format, ensuring seamless integration with the new backend architecture. This release focuses on the core "Create & Send Document" functionality, fully compliant with enterprise security standards.

## Key Changes

### 1. API V2 Compatibility

- **Endpoint Updated**: Now points to `POST /v2/documents/`.
- **Request Body Structure**: Restructured to match `DocumentCreateRequestV2`:
  - `document`: Now handles base64 content and filename properly.
  - `participants`: Correctly formatted list of signers.
  - `signatureValidation`: Object with boolean toggles for each verification type.
  - `config`: Handles `sendInvitations`, `sendByEmail`, `sendByWhatsapp`, and `startAtStep` logic automatically.
  - **2-step flow**: Creates document with `sendInvitations: false`, then sends invitations via `POST /v2/documents/{id}/invite-bulk` for proper GuestSession/WhatsApp support.
- **Authentication**: Uses `Authorization: Bearer <api_key>` header format.

### 2. File Handling Improvements

- **URL Support**: Automatically downloads PDF from `fileUrl` and converts to base64 before sending to backend (backend requires base64).
- **Binary Support**: Reads binary data from previous nodes and converts to base64.
- **Filename Handling**: Smart extraction of filename from URL or binary metadata.

### 3. UI/UX Refinements

- **Unified Signature Options**: Converted "Signature Type" dropdown to a "Verify Autógrafa" boolean toggle, aligned with other verification options (FEA, NOM-151).
- **Cleaned Up Parameters**: Removed unsupported `Templates` selector and `Message` field to prevent user confusion (these features are not yet in the V2 backend).
- **Base URL Configuration**: Added configurable Base URL in credentials to support local development (`http://localhost:8000`) and production (`https://api.allsign.io`).

### 4. Code Quality & Testing

- **Test Suite**: Rewrote all 25 unit tests to match the V2 schema and new node logic. 100% pass rate.
- **Type Safety**: Full TypeScript compilation with zero errors.
- **Linting**: Codebase is lint-free and follows n8n best practices.

## Ready for Deployment

The node is fully tested against the V2 backend specifications and is ready for production deployment.

### Next Steps (Post-MVP)

- Re-enable Templates support when `GET /v2/templates` endpoint is available.
- Add "Get Document" and "Download Document" operations as needed.
