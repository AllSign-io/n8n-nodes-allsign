# Automate NDA Signing with Form Input and AllSign

Automate your NDA workflow end-to-end: a web form collects signer details and contract terms, then AllSign creates the document from an existing **Template** (API v3) and sends the signing invitation automatically via email or WhatsApp — a single call, no separate upload/download step.

## What this workflow does

1. **Form Trigger** — Collects client name, email, company, project description, effective date, confidentiality period, and jurisdiction through a web form
2. **Map Variables** — Transforms form inputs into `templateValues` that fill in the AllSign template's variables, and builds the signer's data
3. **AllSign: Create & Send** — Calls `POST /v3/documents` with `source: "template"`, the `templateId`, `templateValues`, and the inline signer — creating the document and sending the signing invitation in one step

## Prerequisites

- **AllSign account** with API access enabled — [Sign up at allsign.io](https://allsign.io)
- **AllSign API Key** — Generate one from [dashboard.allsign.io/developers/api-keys](https://dashboard.allsign.io/developers/api-keys)
- **An AllSign Template** — Upload `NDA_Template_AllSign.docx` (included in the [GitHub repository](https://github.com/AllSign-io/n8n-nodes-allsign/tree/main/examples)) via the AllSign dashboard's Templates section, and note its Template ID (`tmpl_...`)

## Setup instructions

### 1. Configure AllSign credentials

1. In n8n, go to **Credentials → Add Credential → AllSign API**
2. Paste your API Key (starts with `allsign_live_sk_...` for production or `allsign_test_sk_...` for testing)
3. Leave the Base URL as `https://api.allsign.io` (default)
4. Click **Save** — the connection test validates your key automatically

### 2. Create the NDA template in AllSign

Upload the included `NDA_Template_AllSign.docx` file via the AllSign dashboard's Templates section. This DOCX file contains variable placeholders that are automatically replaced with form values (`templateValues`):

| Template variable | Filled from |
|:---|:---|
| `nombre_completo` | Client Full Name field |
| `nombre_empresa` | Company Name field |
| `fecha_efectiva` | Effective Date field |
| `descripcion_proyecto` | Project Description field |
| `periodo_confidencialidad` | Confidentiality Period dropdown |
| `ley_aplicable` | Governing Law dropdown |

### 3. Set the Template ID

In the **Map Form to Template Variables** node, set the `templateId` assignment to the Template ID you got in step 2 — directly, or via an n8n variable (`$vars.allsign_nda_template_id`) for easier management across environments.

### 4. Activate and test

1. Click **Test Workflow** to open the form in your browser
2. Fill in the fields and submit
3. The signer receives their invitation via email, or WhatsApp if a number was provided

## Customization

- **Add more signers** — Add signer entries in the AllSign node's Signers section (each needs a Delivery Method — Email or WhatsApp — and optionally a Role Name to auto-assign template variables)
- **Change signature validations** — Enable NOM-151, FEA, Biometric Selfie, Video Signature, or ID Scan in the Signature Validations section
- **Add expiration or idempotency** — Set an expiration date or an Idempotency Key in the Configuration section

## Nodes used

- [Form Trigger](https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.formtrigger/) — Web form for data collection
- [Set](https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.set/) — Variable mapping
- [AllSign](https://allsign.io) — Document creation and e-signature (API v3)
