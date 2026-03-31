# Automate NDA Signing with Form Input and AllSign

Automate your NDA workflow end-to-end: a web form collects signer details and contract terms, then AllSign creates the document from a DOCX template and sends signing invitations automatically via email or WhatsApp.

## What this workflow does

1. **Form Trigger** — Collects client name, email, company, project description, effective date, confidentiality period, and jurisdiction through a web form
2. **Map Variables** — Transforms form inputs into template variables that replace `{{ placeholders }}` in the DOCX template
3. **Download Template** — Fetches the NDA DOCX template from a public URL
4. **AllSign: Create & Send** — Uploads the document, fills in the template variables, adds the signer, and sends the signing invitation in one step

## Prerequisites

- **AllSign account** with API access enabled — [Sign up at allsign.io](https://allsign.io)
- **AllSign API Key** — Generate one from [dashboard.allsign.io/developers/api-keys](https://dashboard.allsign.io/developers/api-keys)
- **Hosted DOCX template** — A public URL pointing to your NDA template file (included in the [GitHub repository](https://github.com/AllSign-io/n8n-nodes-allsign/tree/main/examples))

## Setup instructions

### 1. Configure AllSign credentials

1. In n8n, go to **Credentials → Add Credential → AllSign API**
2. Paste your API Key (starts with `allsign_live_sk_...` for production or `allsign_test_sk_...` for testing)
3. Leave the Base URL as `https://api.allsign.io` (default)
4. Click **Save** — the connection test validates your key automatically

### 2. Host the NDA template

Upload the included `NDA_Template_AllSign.docx` file to a public URL. This DOCX file contains `{{ variable }}` placeholders that are automatically replaced with form values:

| Variable | Filled from |
|:---|:---|
| `{{ client_name }}` | Client Full Name field |
| `{{ company_name }}` | Company Name field |
| `{{ effective_date }}` | Effective Date field |
| `{{ project_description }}` | Project Description field |
| `{{ confidentiality_period }}` | Confidentiality Period dropdown |
| `{{ governing_law }}` | Governing Law dropdown |

### 3. Update the template URL

In the **Download NDA Template (DOCX)** node, replace the URL with your hosted template location. You can also set an n8n variable (`$vars.nda_template_url`) for easier management across environments.

### 4. Activate and test

1. Click **Test Workflow** to open the form in your browser
2. Fill in the fields and submit
3. The signer receives their invitation via email (and WhatsApp if provided)

## Customization

- **Add more signers** — Add signer entries in the AllSign node's Signers section
- **Change signature validations** — Enable FEA, NOM-151, eIDAS, biometric selfie, video signature, or ID scan in the Signature Validations section
- **Add expiration** — Set an expiration date in the Configuration section
- **Organize with folders** — Use the Folder section to auto-organize documents

## Nodes used

- [Form Trigger](https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.formtrigger/) — Web form for data collection
- [Set](https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.set/) — Variable mapping
- [HTTP Request](https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.httprequest/) — Template download
- [AllSign](https://allsign.io) — Document creation and e-signature
