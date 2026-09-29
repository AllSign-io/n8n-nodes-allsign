#!/usr/bin/env python3
"""Genera el workflow "HubSpot Closed Won → AllSign contract" para n8n.

Uso:  python3 build_hubspot_template.py [--local] > salida.json
  --local  pone las credenciales y el template ID del n8n local de Sofía
           (para probar). Sin la bandera sale la versión publicable.
"""
import json
import sys
import uuid

LOCAL = "--local" in sys.argv

HUBSPOT_CRED = {"id": "tvmQvR2REPDObmRZ", "name": "HubSpot App Token account"} if LOCAL \
    else {"id": "", "name": "HubSpot App Token"}
SMTP_CRED = {"id": "", "name": "SMTP account"}
ALLSIGN_CRED = {"id": "smokeAllSignDev01", "name": "[smoke] AllSign dev"} if LOCAL \
    else {"id": "", "name": "AllSign API"}
TEMPLATE_ID = "tmpl_95f355eeb6ba4bfebf73a797e37434d4" if LOCAL else "tmpl_REPLACE_ME"

HS = "https://api.hubapi.com"

nodes = []
connections = {}


def node(name, type_, version, params, x, y, cred=None, **extra):
    n = {
        "parameters": params,
        "id": str(uuid.uuid5(uuid.NAMESPACE_URL, name)),
        "name": name,
        "type": type_,
        "typeVersion": version,
        "position": [x, y],
    }
    if cred:
        n["credentials"] = cred
    n.update(extra)
    nodes.append(n)
    return name


def link(src, dst, out=0, dst_in=0):
    outs = connections.setdefault(src, {"main": []})["main"]
    while len(outs) <= out:
        outs.append([])
    outs[out].append({"node": dst, "type": "main", "index": dst_in})


def sticky(content, x, y, w=400, h=220, color=1):
    node(f"Note {len(nodes)}", "n8n-nodes-base.stickyNote", 1,
         {"content": content, "width": w, "height": h, "color": color}, x, y)


def hs_http(name, method, url, x, y, body=None, extra=None):
    p = {
        "method": method,
        "url": url,
        "authentication": "predefinedCredentialType",
        "nodeCredentialType": "hubspotAppToken",
        "options": {},
    }
    if body is not None:
        p["sendBody"] = True
        p["specifyBody"] = "json"
        p["jsonBody"] = body
    if extra:
        p.update(extra)
    return node(name, "n8n-nodes-base.httpRequest", 4.2, p, x, y,
                cred={"hubspotAppToken": HUBSPOT_CRED})


def hs_search(name, filters, props, x, y):
    return node(name, "n8n-nodes-base.hubspot", 2.2, {
        "authentication": "appToken",
        "resource": "deal",
        "operation": "search",
        "returnAll": True,
        "filterGroupsUi": {"filterGroupsValues": [{"filtersUi": {"filterValues": filters}}]},
        "additionalFields": {"properties": props},
    }, x, y, cred={"hubspotAppToken": HUBSPOT_CRED})


def hs_update(name, deal_id_expr, custom, x, y):
    return node(name, "n8n-nodes-base.hubspot", 2.2, {
        "authentication": "appToken",
        "resource": "deal",
        "operation": "update",
        "dealId": {"__rl": True, "mode": "id", "value": deal_id_expr},
        "updateFields": {"customPropertiesUi": {"customPropertiesValues": [
            {"property": k, "value": v} for k, v in custom
        ]}},
    }, x, y, cred={"hubspotAppToken": HUBSPOT_CRED})


def allsign(name, params, x, y, **extra):
    return node(name, "n8n-nodes-allsign.allsign", 1,
                {"resource": "document", **params}, x, y,
                cred={"allSignApi": ALLSIGN_CRED}, **extra)


def note_body(deal_id_expr, body_expr, attachments_expr=None):
    props = {"hs_timestamp": "{{ $now.toISO() }}", "hs_note_body": body_expr}
    if attachments_expr:
        props["hs_attachment_ids"] = attachments_expr
    return "=" + json.dumps({
        "properties": props,
        "associations": [{"to": {"id": deal_id_expr},
                          "types": [{"associationCategory": "HUBSPOT_DEFINED", "associationTypeId": 214}]}],
    })


# ───────────────────────── FLOW 1 — Closed Won → send contract ─────────────────────────
Y1 = 300
sticky(
    "# 1 · Se cierra el negocio → sale el contrato\n\n"
    "Cada 5 minutos el flujo le pregunta a HubSpot por los negocios en **Closed Won** "
    "que todavía no tienen contrato de AllSign, arma el documento con tu plantilla y se "
    "lo manda al contacto del negocio.\n\n"
    "La invitación va por **WhatsApp** cuando el teléfono del contacto se puede completar "
    "con la lada de su país, y por **correo** cuando no: mandar medio número no le llega a "
    "nadie. El negocio guarda el id y el estado del contrato "
    "(`allsign_document_id`, `allsign_contract_status`) para no mandarlo dos veces.",
    -80, Y1 - 420, 620, 340, color=4)

t1 = node("Every 5 minutes", "n8n-nodes-base.scheduleTrigger", 1.2,
          {"rule": {"interval": [{"field": "minutes", "minutesInterval": 5}]}}, 0, Y1)

s1 = hs_search("Closed Won deals without contract", [
    {"propertyName": "dealstage", "operator": "EQ", "value": "closedwon"},
    {"propertyName": "allsign_document_id", "operator": "NOT_HAS_PROPERTY"},
], ["dealname", "amount", "closedate", "allsign_document_id"], 240, Y1)

c1 = hs_http("Contact linked to the deal", "GET",
             "=" + HS + "/crm/v4/objects/deals/{{ $json.id }}/associations/contacts", 480, Y1)

if1 = node("Deal has a contact?", "n8n-nodes-base.if", 2.2, {
    "conditions": {
        "options": {"caseSensitive": True, "leftValue": "", "typeValidation": "strict", "version": 2},
        "conditions": [{"id": "has-contact", "leftValue": "={{ $json.results.length }}",
                        "rightValue": 0, "operator": {"type": "number", "operation": "gt"}}],
        "combinator": "and",
    },
    "options": {},
}, 720, Y1)

c2 = hs_http("Contact details", "GET",
             "=" + HS + "/crm/v3/objects/contacts/{{ $json.results[0].toObjectId }}"
             "?properties=firstname,lastname,email,phone,mobilephone,company,country", 960, Y1)

prep = node("Prepare contract data", "n8n-nodes-base.set", 3.4, {
    "mode": "manual",
    "assignments": {"assignments": [
        {"id": "a1", "name": "dealId", "type": "string",
         "value": "={{ $('Closed Won deals without contract').item.json.id }}"},
        {"id": "a2", "name": "dealName", "type": "string",
         "value": "={{ $('Closed Won deals without contract').item.json.properties.dealname }}"},
        {"id": "a3", "name": "amount", "type": "string",
         "value": "={{ $('Closed Won deals without contract').item.json.properties.amount || '' }}"},
        {"id": "a4", "name": "contactName", "type": "string",
         "value": "={{ [$json.properties.firstname, $json.properties.lastname].filter(Boolean).join(' ') }}"},
        {"id": "a5", "name": "email", "type": "string", "value": "={{ $json.properties.email || '' }}"},
        {"id": "a6", "name": "phone", "type": "string",
         "value": "={{ (() => {\n"
                  "  const raw = ($json.properties.mobilephone || $json.properties.phone || '').trim();\n"
                  "  if (!raw) return '';\n"
                  "  if (raw.startsWith('+')) return '+' + raw.slice(1).replace(/\\D/g, '');\n"
                  "  const dial = { Mexico: '52', 'M\u00e9xico': '52', 'United States': '1', Canada: '1',\n"
                  "                 Spain: '34', 'Espa\u00f1a': '34', Colombia: '57', Argentina: '54',\n"
                  "                 Chile: '56', Peru: '51', 'Per\u00fa': '51', Brazil: '55' };\n"
                  "  const code = dial[($json.properties.country || '').trim()];\n"
                  "  const digits = raw.replace(/\\D/g, '');\n"
                  "  return code ? '+' + code + digits : '';\n"
                  "})() }}"},
        {"id": "a7", "name": "company", "type": "string", "value": "={{ $json.properties.company || '' }}"},
        {"id": "a8", "name": "channel", "type": "string",
         # WhatsApp solo cuando el numero quedo completo con lada de pais. Si no
         # se puede saber el pais, va por correo: mandar un numero a medias falla.
         "value": "={{ (() => {\n"
                  "  const raw = ($json.properties.mobilephone || $json.properties.phone || '').trim();\n"
                  "  if (!raw) return 'email';\n"
                  "  if (raw.startsWith('+')) return 'whatsapp';\n"
                  "  const known = ['Mexico','M\u00e9xico','United States','Canada','Spain','Espa\u00f1a',\n"
                  "                 'Colombia','Argentina','Chile','Peru','Per\u00fa','Brazil'];\n"
                  "  return known.includes(($json.properties.country || '').trim()) ? 'whatsapp' : 'email';\n"
                  "})() }}"},
        {"id": "a9", "name": "templateId", "type": "string", "value": TEMPLATE_ID},
    ]},
    "options": {},
}, 1200, Y1)

sw = node("WhatsApp or email?", "n8n-nodes-base.switch", 3.2, {
    "rules": {"values": [
        {"conditions": {"options": {"caseSensitive": True, "leftValue": "", "typeValidation": "strict", "version": 2},
                        "conditions": [{"id": "wa", "leftValue": "={{ $json.channel }}", "rightValue": "whatsapp",
                                        "operator": {"type": "string", "operation": "equals"}}],
                        "combinator": "and"},
         "renameOutput": True, "outputKey": "WhatsApp"},
        {"conditions": {"options": {"caseSensitive": True, "leftValue": "", "typeValidation": "strict", "version": 2},
                        "conditions": [{"id": "em", "leftValue": "={{ $json.channel }}", "rightValue": "email",
                                        "operator": {"type": "string", "operation": "equals"}}],
                        "combinator": "and"},
         "renameOutput": True, "outputKey": "Email"},
    ]},
    "options": {},
}, 1440, Y1)

create = allsign("Create contract in AllSign", {
    "operation": "createDocument",
    "documentName": "=Contract — {{ $json.dealName }}",
    "source": "template",
    "templateId": "={{ $json.templateId }}",
    "templateValues": "={{ JSON.stringify({ nombre_cliente: $json.contactName, "
                      "empresa_cliente: $json.company || $json.dealName, correo_cliente: $json.email, "
                      "objeto: $json.dealName, fecha_efectiva: $today.toFormat('dd/MM/yyyy'), "
                      "empresa_emisora: 'Tu empresa', vigencia: 'dos años', "
                      "jurisdiccion: 'Ciudad de México' }) }}",
    "signers": {"signerValues": [{
        "name": "={{ $json.contactName }}",
        "deliveryMethod": "={{ $json.channel }}",
        "email": "={{ $json.email }}",
        "whatsapp": "={{ $json.phone }}",
        "roleName": "cliente",
    }]},
    "signatureValidations": {"verifyAutografa": True, "verifyNom151": True},
}, 1920, Y1)

send = allsign("Send for signature", {
    "operation": "sendDocument",
    "documentId": "={{ $json.id }}",
}, 2160, Y1)

save = hs_update("Save contract ID on the deal", "={{ $('Prepare contract data').item.json.dealId }}", [
    ("allsign_document_id", "={{ $('Create contract in AllSign').item.json.id }}"),
    ("allsign_contract_status", "sent"),
], 2400, Y1)

note1 = hs_http("Log 'contract sent' on the deal", "POST", HS + "/crm/v3/objects/notes", 2640, Y1,
                body=note_body("{{ $('Prepare contract data').item.json.dealId }}",
                               "Contract sent for signature via AllSign ({{ $('Create contract in AllSign').item.json.id }}) "
                               "by {{ $('Prepare contract data').item.json.channel }} to {{ $('Prepare contract data').item.json.contactName }}."))

for a, b in [(t1, s1), (s1, c1), (c1, if1), (c2, prep), (prep, sw),
             (create, send), (send, save), (save, note1)]:
    link(a, b)
link(if1, c2, 0)
link(sw, create, 0)
link(sw, create, 1)

# ───────────────────────── FLOW 2 — signed → close the loop ─────────────────────────
Y2 = 1100
sticky(
    "# 2 · Ya firmaron → la evidencia llega al negocio\n\n"
    "El **AllSign Trigger** registra un webhook en tu cuenta de AllSign y se dispara con "
    "`document.completed`. El flujo busca el negocio por el id del contrato, baja el PDF "
    "firmado y la **constancia NOM-151**, los sube a HubSpot, los deja adjuntos en una nota "
    "del negocio y lo marca como **firmado**.\n\n"
    "Tu llave de AllSign necesita los permisos `webhook:read`, `webhook:write` y "
    "`webhook:delete` para que el disparador se registre y limpie lo suyo al final.",
    -80, Y2 - 440, 620, 360, color=4)

trig = node("Contract signed", "n8n-nodes-allsign.allsignTrigger", 1, {
    "events": ["document.completed"],
    "endpointDescription": "n8n — HubSpot contract template",
}, 0, Y2, cred={"allSignApi": ALLSIGN_CRED}, webhookId=str(uuid.uuid5(uuid.NAMESPACE_URL, "allsign-hubspot-trigger")))

s2 = hs_search("Deal for this contract", [
    {"propertyName": "allsign_document_id", "operator": "EQ", "value": "={{ $json.data.documentId }}"},
], ["dealname", "allsign_document_id"], 240, Y2)

ev = allsign("Signed PDF + NOM-151 certificate", {
    "operation": "getDocumentEvidence",
    "documentId": "={{ $('Contract signed').item.json.data.documentId }}",
}, 480, Y2)

ready = node("Evidence ready?", "n8n-nodes-base.if", 2.2, {
    "conditions": {
        "options": {"caseSensitive": True, "leftValue": "", "typeValidation": "strict", "version": 2},
        "conditions": [{"id": "avail", "leftValue": "={{ $json.available }}", "rightValue": True,
                        "operator": {"type": "boolean", "operation": "true", "singleValue": True}}],
        "combinator": "and",
    },
    "options": {},
}, 720, Y2)

wait_ev = node("Wait 1 minute", "n8n-nodes-base.wait", 1.1, {"amount": 60, "unit": "seconds"}, 720, Y2 + 200,
               webhookId=str(uuid.uuid5(uuid.NAMESPACE_URL, "wait-evidence")))

files = node("List files to attach", "n8n-nodes-base.code", 2, {
    "jsCode": (
        "// One item per file that exists. NOM-151 is null for sandbox (test-mode) documents.\n"
        "const ev = $input.first().json;\n"
        "const docId = ev.documentId;\n"
        "const out = [];\n"
        "if (ev.evidencePdf?.url) out.push({ json: { fileName: `${docId}-signed.pdf`, url: ev.evidencePdf.url, kind: 'Signed PDF' } });\n"
        "if (ev.nom151?.url) out.push({ json: { fileName: `${docId}-nom151.pdf`, url: ev.nom151.url, kind: 'NOM-151 certificate' } });\n"
        "return out;"
    ),
}, 960, Y2)

dl = node("Download file", "n8n-nodes-base.httpRequest", 4.2, {
    "method": "GET",
    "url": "={{ $json.url }}",
    "options": {"response": {"response": {"responseFormat": "file", "outputPropertyName": "data"}}},
}, 1200, Y2)

up = hs_http("Upload to HubSpot Files", "POST", HS + "/files/v3/files", 1440, Y2, extra={
    "sendBody": True,
    "contentType": "multipart-form-data",
    "bodyParameters": {"parameters": [
        {"parameterType": "formBinaryData", "name": "file", "inputDataFieldName": "data"},
        {"name": "fileName", "value": "={{ $('List files to attach').item.json.fileName }}"},
        {"name": "folderPath", "value": "/AllSign contracts"},
        {"name": "options", "value": "{\"access\":\"PRIVATE\",\"overwrite\":false}"},
    ]},
})

agg = node("Collect file IDs", "n8n-nodes-base.aggregate", 1, {
    "aggregate": "aggregateIndividualFields",
    "fieldsToAggregate": {"fieldToAggregate": [{"fieldToAggregate": "id", "renameField": True, "outputFieldName": "fileIds"}]},
    "options": {},
}, 1680, Y2)

note2 = hs_http("Attach evidence to the deal", "POST", HS + "/crm/v3/objects/notes", 1920, Y2,
                body=note_body("{{ $('Deal for this contract').first().json.id }}",
                               "Contract signed by all parties in AllSign "
                               "({{ $('Contract signed').first().json.data.documentId }}). "
                               "Attached: signed PDF and NOM-151 certificate.",
                               "{{ $json.fileIds.join(';') }}"))

mark = hs_update("Mark contract as signed", "={{ $('Deal for this contract').first().json.id }}", [
    ("allsign_contract_status", "signed"),
], 2160, Y2)

notify = node("Tell the team", "n8n-nodes-base.emailSend", 2.1, {
    "fromEmail": "no-reply@example.com",
    "toEmail": "sales@example.com",
    "subject": "=Signed: {{ $('Deal for this contract').first().json.properties.dealname }}",
    "emailFormat": "html",
    "html": "=The contract for <b>{{ $('Deal for this contract').first().json.properties.dealname }}</b> "
            "is signed by all parties.<br><br>The signed PDF and the NOM-151 certificate are attached "
            "to the deal in HubSpot.",
    "options": {},
}, 2400, Y2, cred={"smtp": SMTP_CRED})

# ── Error branch: one place to notice a run that broke ──────────────────
sticky(
    "# Si algo truena\n\n"
    "El **Error Trigger** se dispara cuando cualquier corrida del flujo falla: una "
    "credencial mala, AllSign caído, HubSpot que corta por exceso de llamadas. Sin él, un "
    "contrato que no salió pasa desapercibido y el negocio se queda como si estuviera "
    "enviado.\n\n"
    "Mándalo a donde de verdad lo veas: si prefieres tu chat, cambia el nodo de correo por "
    "el de tu herramienta.",
    -80, Y2 + 520, 560, 260, color=3)

err = node("Something failed", "n8n-nodes-base.errorTrigger", 1, {}, 0, Y2 + 900)
err_msg = node("Report the failure", "n8n-nodes-base.emailSend", 2.1, {
    "fromEmail": "no-reply@example.com",
    "toEmail": "sales@example.com",
    "subject": "AllSign contract workflow failed",
    "emailFormat": "html",
    "html": "=The run failed at <b>{{ $json.execution.lastNodeExecuted }}</b>.<br><br>"
            "{{ $json.execution.error.message }}",
    "options": {},
}, 240, Y2 + 900, cred={"smtp": SMTP_CRED})
link(err, err_msg)

for a, b in [(trig, s2), (s2, ev), (ev, ready), (wait_ev, ev), (files, dl), (dl, up), (up, agg), (agg, note2), (note2, mark), (mark, notify)]:
    link(a, b)
link(ready, files, 0)
link(ready, wait_ev, 1)

# ───────────────────────── FLOW 3 — daily reminders ─────────────────────────
Y3 = 2600
sticky(
    "# 3 · Recordatorio diario a quien falta por firmar\n\n"
    "Cada mañana el flujo toma los negocios cuyo contrato sigue en **enviado**, le pregunta "
    "a AllSign quién falta y le manda un recordatorio a cada uno, por el mismo medio que la "
    "invitación.\n\n"
    "AllSign permite un recordatorio por firmante cada 4 horas y 10 llamadas por minuto: por "
    "eso salen de uno en uno con una pausa, y uno rechazado no detiene la corrida.",
    -80, Y3 - 400, 620, 320, color=4)

t3 = node("Every day at 9:00", "n8n-nodes-base.scheduleTrigger", 1.2,
          {"rule": {"interval": [{"field": "cronExpression", "expression": "0 9 * * 1-5"}]}}, 0, Y3)

s3 = hs_search("Deals waiting for signature", [
    {"propertyName": "allsign_contract_status", "operator": "EQ", "value": "sent"},
], ["dealname", "allsign_document_id"], 240, Y3)

signers = allsign("Signers of each contract", {
    "operation": "listDocumentSigners",
    "documentId": "={{ $json.properties.allsign_document_id }}",
}, 480, Y3)

split = node("One item per signer", "n8n-nodes-base.splitOut", 1,
             {"fieldToSplitOut": "data", "options": {}}, 720, Y3)

pending = node("Still pending?", "n8n-nodes-base.filter", 2.2, {
    "conditions": {
        "options": {"caseSensitive": True, "leftValue": "", "typeValidation": "strict", "version": 2},
        "conditions": [{"id": "pend", "leftValue": "={{ $json.status }}", "rightValue": "pending",
                        "operator": {"type": "string", "operation": "equals"}}],
        "combinator": "and",
    },
    "options": {},
}, 960, Y3)

loop = node("One at a time", "n8n-nodes-base.splitInBatches", 3, {"batchSize": 1, "options": {}}, 1200, Y3)

remind = allsign("Remind signer", {
    "operation": "remindSigner",
    "documentId": "={{ $json.documentId }}",
    "signerId": "={{ $json.id }}",
}, 1440, Y3 + 160, onError="continueRegularOutput")

pause = node("Pause 7 seconds", "n8n-nodes-base.wait", 1.1, {"amount": 7, "unit": "seconds"}, 1680, Y3 + 160,
             webhookId=str(uuid.uuid5(uuid.NAMESPACE_URL, "wait-remind")))

for a, b in [(t3, s3), (s3, signers), (signers, split), (split, pending), (pending, loop), (remind, pause), (pause, loop)]:
    link(a, b)
link(loop, remind, 1)  # output "loop"

# ───────────────────────── setup note ─────────────────────────
sticky(
    "# Instalación (5 minutos)\n\n"
    "1. **AllSign** → Desarrolladores → API keys. Crea una llave con los permisos de "
    "documentos más `webhook:read`, `webhook:write` y `webhook:delete`. Guárdala en la "
    "credencial *AllSign API*.\n"
    "2. **HubSpot** → Configuración → Integraciones → Aplicaciones privadas. Crea una con "
    "`crm.objects.contacts` (lectura y escritura), `crm.objects.deals` (lectura y "
    "escritura), `crm.schemas.deals.read` y `files`. Guarda el token en la credencial "
    "*HubSpot App Token*.\n"
    "3. En HubSpot agrega dos **propiedades de negocio**: `allsign_document_id` (texto de "
    "una línea) y `allsign_contract_status` (desplegable con `sent` y `signed`).\n"
    "4. Sube tu contrato como **plantilla** en AllSign y pega su id `tmpl_…` en *Prepare "
    "contract data*. En *Create contract in AllSign* las variables salen del negocio y de "
    "su contacto; las tres que son tuyas —quién revela, la vigencia y la jurisdicción— "
    "están escritas ahí como texto, cámbialas una vez. En este repo, "
    "`examples/NDA_Plantilla_AllSign_ES.docx` es un acuerdo de confidencialidad en español "
    "con esas mismas variables.\n"
    "5. Los dos nodos de correo traen direcciones de ejemplo (`sales@example.com`) que "
    "rebotan. Conecta tu servidor de correo y pon tu remitente y tu destinatario, o "
    "bórralos.\n"
    "6. Publica el flujo. Cierra un negocio como **Closed Won** y velo salir.\n\n"
    "**¿Correo o WhatsApp?** Lo decide el flujo contacto por contacto, tú no eliges: el "
    "teléfono toma la lada del país que traiga el contacto en HubSpot, y si no se sabe el "
    "país el contrato se va por correo en lugar de mandar medio número. Para forzar siempre "
    "el mismo medio, abre *Prepare contract data* y cambia el valor de `channel` por "
    "`email` o `whatsapp`.",
    620, Y1 - 560, 780, 520, color=6)

workflow = {
    "name": "Close HubSpot deals with NOM-151 compliant e-signature and WhatsApp delivery",
    "nodes": nodes,
    "connections": connections,
    "settings": {"executionOrder": "v1"},
    "meta": {"templateCredsSetupCompleted": False},
}
print(json.dumps(workflow, indent=2, ensure_ascii=False))
