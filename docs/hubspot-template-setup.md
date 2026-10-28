# HubSpot → AllSign template · full setup

The sticky note on the canvas has the six steps. This page has the parts that do
not fit on a sticky note: the request that places the signature boxes, the
fields AllSign will not accept empty, and what to change when your pipeline is
not the default one.

Template: `examples/HubSpot_Closed_Won_AllSign_Contract.json`.

> **Self-hosted n8n only.** The template uses the AllSign community node
> (`n8n-nodes-allsign`), and community nodes cannot run on n8n Cloud.

## 1 · Credentials

**AllSign** → Developers → API keys. The key needs the document scopes plus
`webhook:read`, `webhook:write` and `webhook:delete`: the AllSign Trigger
registers its own webhook when you activate the workflow and removes it when you
deactivate. Save the key in the *AllSign API* credential.

**HubSpot** → Settings → Integrations → Private apps. Create one with
`crm.objects.contacts` (read and write), `crm.objects.deals` (read and write),
`crm.schemas.deals.read` and `files`. Save the token in the *HubSpot App Token*
credential.

## 2 · Two deal properties

In HubSpot, add:

| Property | Type |
|---|---|
| `allsign_document_id` | Single-line text |
| `allsign_contract_status` | Dropdown: `created`, `sent`, `signed`, `error` |

A deal marked `error` is not retried on its own. To retry it, clear both
properties by hand — but look the contract up in AllSign first: if it already
exists, do not retry, or a second one goes out and is charged.

## 3 · Your contract as an AllSign template

Upload your contract to AllSign as a template and paste its `tmpl_…` id into
*Prepare contract data*.

Lower down in that same node are the variables that come from you and not from
the CRM: **empresa_emisora**, **emisor_nombre**, **emisor_correo**,
**vigencia**, **jurisdiccion** and **objeto**.

The first three ship empty on purpose. If you leave them empty, AllSign rejects
the contract with a 422 and you find out — instead of sending your customer an
agreement with placeholder text. The issuer's email has to differ from the
customer's: the API will not take two signers with the same address.

Two values matter more than they look:

- **`vigencia`** has to carry its unit, for example *dos años*, because the
  contract reads "por un plazo de…".
- **`jurisdiccion`** has to be the address of one of the two companies or the
  place where the agreement is performed. A city unrelated to either one can
  make the choice of courts unenforceable.

This repository ships `examples/NDA_Plantilla_AllSign_ES.docx`, a Spanish
non-disclosure agreement that already carries these variables.

## 4 · Tell AllSign where the signature boxes go

Once per template, call `PUT /v3/templates/{yourTemplate}/signing` with:

```json
{"roles": [
  {"name": "emisor",  "fields": [{"roleName": "emisor",  "kind": "signature", "page": 3,
     "rect": {"x": 8,  "y": 30, "width": 35, "height": 7},
     "anchor": "Firma de la Parte emisora", "expect": 1, "onMiss": "fail"}]},
  {"name": "cliente", "fields": [{"roleName": "cliente", "kind": "signature", "page": 3,
     "rect": {"x": 55, "y": 30, "width": 35, "height": 7},
     "anchor": "Firma de la Parte cliente", "expect": 1, "onMiss": "fail"}]}
]}
```

Without this, AllSign puts the signatures at the foot of the **first** page, on
top of the clauses. The `anchor` strings are the ones in the agreement shipped
here; with a different document, use your own, and make sure each appears
exactly once. The anchor wins over `page` and `rect` when it is found, so the
boxes follow your text even if the page count changes.

## 5 · Your own sender

Both email nodes ship with `sales@example.com`, which bounces. Connect your mail
server and set your sender and your recipient, or delete the nodes.

## 6 · Activate

Activate the workflow, move a deal to **Contract sent** and watch it go. Deals
that were already in that stage when you activated do not get a contract: only
the ones that enter afterwards.

## Not the default pipeline?

The stages `contractsent` and `closedwon` belong to the pipeline HubSpot ships
with. With your own pipeline, replace `contractsent` with your stage id in
*Deals ready for their contract* (in the stage filter, in
`hs_v2_date_entered_contractsent` and in the properties it reads) and in the
`fecha_efectiva` field of *Prepare contract data*; and `closedwon` in *Move the
deal to Closed Won*. Your stage id comes from HubSpot, in the pipeline settings.

## Email or WhatsApp?

The invitation goes out by email. To send it over WhatsApp, open *Prepare
contract data*, field `channel`, and change `prefiere` from `email` to
`whatsapp` on the first line. For WhatsApp the phone has to carry its country
code (`+52…`) or be completable from the country the contact has in HubSpot; if
it cannot, that contract goes by email instead of failing. The contact's email
is always needed: the contract itself carries it.

## Don't want the pipeline moved?

Delete the *Move the deal to Closed Won* node. Everything else keeps working.
