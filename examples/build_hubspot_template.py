#!/usr/bin/env python3
"""Genera el workflow "HubSpot Contrato enviado → AllSign contract" para n8n.

Uso:  python3 build_hubspot_template.py [--local] > salida.json
  --local  toma las credenciales y la plantilla de tu entorno, para probar:
           N8N_CRED_HUBSPOT, N8N_CRED_SMTP, N8N_CRED_ALLSIGN y
           ALLSIGN_TEMPLATE_ID. Sin la bandera sale la versión publicable.
"""
import json
import os
import sys
import uuid

LOCAL = "--local" in sys.argv


def _del_entorno(variable, por_defecto=""):
    return os.environ.get(variable, por_defecto) if LOCAL else por_defecto


HUBSPOT_CRED = {"id": _del_entorno("N8N_CRED_HUBSPOT"), "name": "HubSpot App Token"}
SMTP_CRED = {"id": _del_entorno("N8N_CRED_SMTP"), "name": "SMTP account"}
ALLSIGN_CRED = {"id": _del_entorno("N8N_CRED_ALLSIGN"), "name": "AllSign API"}
TEMPLATE_ID = _del_entorno("ALLSIGN_TEMPLATE_ID", "tmpl_REPLACE_ME")

ETAPA = "contractsent"
ENTRO_A_LA_ETAPA = "hs_v2_date_entered_" + ETAPA
REINTENTOS = {"retryOnFail": True, "maxTries": 5, "waitBetweenTries": 5000}

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


def hs_update(name, deal_id_expr, custom, x, y, **extra):
    return node(name, "n8n-nodes-base.hubspot", 2.2, {
        "authentication": "appToken",
        "resource": "deal",
        "operation": "update",
        "dealId": {"__rl": True, "mode": "id", "value": deal_id_expr},
        "updateFields": {"customPropertiesUi": {"customPropertiesValues": [
            {"property": k, "value": v} for k, v in custom
        ]}},
    }, x, y, cred={"hubspotAppToken": HUBSPOT_CRED}, **extra)


def allsign(name, params, x, y, **extra):
    return node(name, "n8n-nodes-allsign.allsign", 1,
                {"resource": "document", **params}, x, y,
                cred={"allSignApi": ALLSIGN_CRED}, **extra)


# La llave que evita cobrar dos veces. Tiene que ser un UUID v4 —el backend lo
# valida— y, sobre todo, tiene que salir del NEGOCIO y no de la ejecución: si
# sale de la ejecución, el ciclo siguiente la cambia y la API ve una peticion
# nueva, crea otro contrato y vuelve a cobrar.
def clave(prefijo, semilla):
    return ("={{ ('" + prefijo + "-' + " + semilla + ").hash('sha256')"
            ".replace(/^(.{8})(.{4}).(.{3}).(.{3})(.{12}).*$/, '$1-$2-4$3-8$4-$5') }}")


def note_body(deal_id_expr, body_expr, attachments_expr=None):
    props = {"hs_timestamp": "{{ $now.toISO() }}", "hs_note_body": body_expr}
    if attachments_expr:
        props["hs_attachment_ids"] = attachments_expr
    return "=" + json.dumps({
        "properties": props,
        "associations": [{"to": {"id": deal_id_expr},
                          "types": [{"associationCategory": "HUBSPOT_DEFINED", "associationTypeId": 214}]}],
    })


# ───────────────────────── FLOW 1 — Contrato enviado → send contract ─────────────────────────
Y1 = 300
sticky(
    "# 1 · El negocio avanza → sale el contrato\n\n"
    "Cada 5 minutos el flujo le pregunta a HubSpot por los negocios en **Contrato "
    "enviado** que todavía no tienen contrato de AllSign, arma el documento con tu "
    "plantilla y se lo manda al contacto. Mover el negocio a esa etapa es justo lo que "
    "el vendedor ya hace cuando manda un contrato. Los negocios que ya estaban en esa "
    "etapa cuando publicaste el flujo no reciben contrato: solo los que entran después.\n\n"
    "La invitación va por **correo**. Si tu equipo prefiere **WhatsApp**, cámbialo en "
    "*Prepare contract data* (la nota de instalación dice cómo). El negocio guarda el id y "
    "el estado del contrato (`allsign_document_id`, `allsign_contract_status`) para no "
    "mandarlo dos veces.",
    -80, Y1 - 420, 620, 340, color=4)

t1 = node("Every 5 minutes", "n8n-nodes-base.scheduleTrigger", 1.2,
          {"rule": {"interval": [{"field": "minutes", "minutesInterval": 5}]}}, -240, Y1)

desde = node("Only deals that move from now on", "n8n-nodes-base.code", 2, {
    "jsCode": (
        "const marca = $getWorkflowStaticData('global');\n"
        "if (!marca.desde) marca.desde = Date.now() - 5 * 60 * 1000;\n"
        "return [{ json: { desde: marca.desde } }];"
    ),
}, 0, Y1)

s1 = hs_search("Deals ready for their contract", [
    {"propertyName": "dealstage", "operator": "EQ", "value": ETAPA},
    {"propertyName": ENTRO_A_LA_ETAPA, "operator": "GTE", "value": "={{ $json.desde }}"},
    {"propertyName": "allsign_document_id", "operator": "NOT_HAS_PROPERTY"},
    # Un negocio marcado como `error` no se reintenta solo cada cinco minutos.
    # Para reintentarlo, una persona borra el estado y el id a mano.
    {"propertyName": "allsign_contract_status", "operator": "NOT_HAS_PROPERTY"},
], ["dealname", "amount", "closedate", "allsign_document_id", ENTRO_A_LA_ETAPA], 240, Y1)

START_CHAIN = [(t1, desde), (desde, s1)]
ENTRY = s1   # el nodo que le pasa el deal al resto del flujo
DEAL = s1    # el nodo que trae el deal, se llama distinto en cada variante

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
         "value": "={{ $('" + DEAL + "').item.json.id }}"},
        {"id": "a2", "name": "dealName", "type": "string",
         "value": "={{ $('" + DEAL + "').item.json.properties.dealname }}"},
        {"id": "a3", "name": "amount", "type": "string",
         "value": "={{ $('" + DEAL + "').item.json.properties.amount || '' }}"},
        {"id": "a4", "name": "contactName", "type": "string",
         "value": "={{ [$json.properties.firstname, $json.properties.lastname].filter(Boolean).join(' ') }}"},
        {"id": "a5", "name": "email", "type": "string", "value": "={{ $json.properties.email || '' }}"},
        {"id": "a6", "name": "phone", "type": "string",
         "value": "={{ (() => {\n"
                  "  const raw = ($json.properties.mobilephone || $json.properties.phone || '').trim();\n"
                  "  if (!raw) return '';\n"
                  "  if (raw.startsWith('+')) return '+' + raw.slice(1).replace(/\\D/g, '');\n"
                  "  const dial = { Mexico: ['52', 10], 'M\u00e9xico': ['52', 10], 'United States': ['1', 10],\n"
                  "                 Canada: ['1', 10], Spain: ['34', 9], 'Espa\u00f1a': ['34', 9],\n"
                  "                 Colombia: ['57', 10], Argentina: ['54', 10], Chile: ['56', 9],\n"
                  "                 Peru: ['51', 9], 'Per\u00fa': ['51', 9], Brazil: ['55', 11] };\n"
                  "  const [code, national] = dial[($json.properties.country || '').trim()] || [];\n"
                  "  if (!code) return '';\n"
                  "  const digits = raw.replace(/\\D/g, '').replace(/^00/, '');\n"
                  "  return digits.length > national && digits.startsWith(code) ? '+' + digits : '+' + code + digits;\n"
                  "})() }}"},
        {"id": "a7", "name": "company", "type": "string", "value": "={{ $json.properties.company || '' }}"},
        {"id": "a8", "name": "channel", "type": "string",
         # El medio lo eliges tu en la primera linea, no lo decide el dato. Si
         # pides WhatsApp pero el telefono no se puede completar con la lada del
         # pais, ese contrato se va por correo: medio numero no llega a nadie.
         "value": "={{ (() => {\n"
                  "  const prefiere = 'email';   // cambia a 'whatsapp' si tu equipo manda por ahi\n"
                  "  const raw = ($json.properties.mobilephone || $json.properties.phone || '').trim();\n"
                  "  if (!raw) return 'email';\n"
                  "  const known = ['Mexico','M\u00e9xico','United States','Canada','Spain','Espa\u00f1a',\n"
                  "                 'Colombia','Argentina','Chile','Peru','Per\u00fa','Brazil'];\n"
                  "  const completo = raw.startsWith('+') || known.includes(($json.properties.country || '').trim());\n"
                  "  return prefiere === 'whatsapp' && completo ? 'whatsapp' : 'email';\n"
                  "})() }}"},
        {"id": "a9", "name": "templateId", "type": "string", "value": TEMPLATE_ID},
        # Los tres valores que no vienen del CRM sino de ti. Van aqui, con nombre
        # propio, y no escondidos dentro del JSON del contrato: son los que cada
        # quien cambia al instalar la plantilla.
        # Va VACÍO a propósito. Si alguien no lo llena, AllSign rechaza el contrato
        # con un 422 y se entera; con un ejemplo dentro, el cliente recibiría un
        # acuerdo que dice "entre Tu empresa".
        {"id": "a10", "name": "empresa_emisora", "type": "string", "value": ""},
        {"id": "a11", "name": "vigencia", "type": "string", "value": "dos años"},
        {"id": "a12", "name": "jurisdiccion", "type": "string", "value": "Ciudad de México"},
        # Quien firma por tu empresa. Su correo tiene que ser distinto al del
        # cliente: la API rechaza dos firmantes con el mismo.
        {"id": "a13", "name": "emisor_nombre", "type": "string", "value": ""},
        {"id": "a14", "name": "emisor_correo", "type": "string", "value": ""},
        # El nombre del negocio es interno y a veces dice cosas como "Renovación
        # 2027 - 2a llamada". En el contrato queda "con motivo de …", así que va
        # una frase legible.
        {"id": "a15", "name": "objeto", "type": "string",
         "value": "la evaluación de una posible relación comercial"},
        {"id": "a16", "name": "fecha_efectiva", "type": "string",
         "value": "={{ $('" + DEAL + "').item.json.properties." + ENTRO_A_LA_ETAPA + " ? "
                  "DateTime.fromISO($('" + DEAL + "').item.json.properties." + ENTRO_A_LA_ETAPA + ")"
                  ".setZone($now.zone).toFormat('dd/MM/yyyy') : '' }}"},
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

con_correo = node("Contact has an email?", "n8n-nodes-base.if", 2.2, {
    "conditions": {
        "options": {"caseSensitive": True, "leftValue": "", "typeValidation": "strict", "version": 2},
        "conditions": [{"id": "correo", "leftValue": "={{ $json.email }}", "rightValue": "",
                        "operator": {"type": "string", "operation": "notEmpty", "singleValue": True}}],
        "combinator": "and",
    },
    "options": {},
}, 1680, Y1)

create = allsign("Create contract in AllSign", {
    "operation": "createDocument",
    "documentName": "=Contract — {{ $json.dealName }}",
    "source": "template",
    "templateId": "={{ $json.templateId }}",
    "templateValues": "={{ JSON.stringify({ nombre_cliente: $json.contactName, "
                      "empresa_cliente: $json.company || $json.contactName, correo_cliente: $json.email, "
                      "objeto: $json.objeto, fecha_efectiva: $json.fecha_efectiva, "
                      "empresa_emisora: $json.empresa_emisora, representante_emisor: $json.emisor_nombre, "
                      "correo_emisor: $json.emisor_correo, "
                      "vigencia: $json.vigencia, "
                      "jurisdiccion: $json.jurisdiccion }) }}",
    "signers": {"signerValues": [
        # Las dos partes firman. El acuerdo es recíproco, así que la empresa que
        # revela también se obliga. Ojo: los dos correos tienen que ser distintos,
        # la API rechaza dos firmantes con el mismo.
        {
            "name": "={{ $json.emisor_nombre }}",
            "deliveryMethod": "email",
            "email": "={{ $json.emisor_correo }}",
            "roleName": "emisor",
        },
        {
            "name": "={{ $json.contactName }}",
            "deliveryMethod": "={{ $json.channel }}",
            "email": "={{ $json.email }}",
            "whatsapp": "={{ $json.phone }}",
            "roleName": "cliente",
        },
    ]},
    "signatureValidations": {"verifyAutografa": True, "verifyNom151": True},
    "configuration": {"idempotencyKey": clave("allsign-hubspot-create", "$json.dealId")},
}, 1920, Y1, onError="continueErrorOutput", **REINTENTOS)

# Guardar el id ANTES de enviar. Si el envío falla y el id no estaba guardado,
# el ciclo siguiente no encuentra el contrato, crea otro y cobra otra vez.
save_created = hs_update("Save contract ID on the deal", "={{ $('Prepare contract data').item.json.dealId }}", [
    ("allsign_document_id", "={{ $('Create contract in AllSign').item.json.id }}"),
    ("allsign_contract_status", "created"),
], 2160, Y1, onError="continueErrorOutput", **REINTENTOS)

send = allsign("Send for signature", {
    "operation": "sendDocument",
    # El documento ya no llega por la entrada: ahora entra el deal. El id se lee
    # del nodo que lo creó.
    "documentId": "={{ $('Create contract in AllSign').item.json.id }}",
    "idempotencyKey": clave("allsign-hubspot-send", "$('Create contract in AllSign').item.json.id"),
}, 2400, Y1, onError="continueErrorOutput", **REINTENTOS)

save_sent = hs_update("Mark contract as sent", "={{ $('Prepare contract data').item.json.dealId }}", [
    ("allsign_contract_status", "sent"),
], 2640, Y1)

note1 = hs_http("Log 'contract sent' on the deal", "POST", HS + "/crm/v3/objects/notes", 2880, Y1,
                body=note_body("{{ $('Prepare contract data').item.json.dealId }}",
                               "Contract sent for signature via AllSign ({{ $('Create contract in AllSign').item.json.id }}) "
                               "by {{ $('Prepare contract data').item.json.channel }} to "
                               "{{ JSON.stringify($('Prepare contract data').item.json.contactName).slice(1, -1) }}."))

# Todo lo que puede fallar termina aquí, y el negocio queda marcado. Así nadie se
# queda esperando un contrato que nunca salió, y el reloj no lo reintenta solo.
failed = hs_update("Mark deal as failed", "={{ $('" + DEAL + "').item.json.id }}", [
    ("allsign_contract_status", "error"),
], 2160, Y1 + 260)

alto = node("Stop: no contract went out", "n8n-nodes-base.stopAndError", 1, {
    "errorMessage": "=No contract went out for the deal \"{{ $('" + DEAL + "').item.json.properties.dealname }}\" "
                    "({{ $('" + DEAL + "').item.json.id }}). It is marked as error in HubSpot.",
}, 2400, Y1 + 260)

for a, b in START_CHAIN + [(ENTRY, c1), (c1, if1), (c2, prep), (prep, sw),
                           (create, save_created), (save_created, send),
                           (send, save_sent), (save_sent, note1), (failed, alto)]:
    link(a, b)
link(if1, c2, 0)
link(sw, con_correo, 0)
link(sw, con_correo, 1)
link(con_correo, create, 0)
link(con_correo, failed, 1)
# Las salidas de error: sin contacto, y las tres operaciones que pueden tronar.
link(if1, failed, 1)
link(create, failed, 1)
link(save_created, failed, 1)
link(send, failed, 1)

# ───────────────────────── FLOW 2 — signed → close the loop ─────────────────────────
Y2 = 1100
sticky(
    "# 2 · Ya firmaron → la evidencia llega al negocio\n\n"
    "El **AllSign Trigger** registra un webhook en tu cuenta de AllSign y se dispara con "
    "`document.completed`. El flujo busca el negocio por el id del contrato, baja el PDF "
    "firmado y la **constancia NOM-151**, los sube a HubSpot, los deja adjuntos en una nota "
    "del negocio, lo marca como **firmado** y lo mueve a **Cierre ganado**: hasta que "
    "firman, el negocio no está ganado. Si prefieres mover el embudo a mano, borra el "
    "nodo *Move the deal to Closed Won* y lo demás sigue igual.\n\n"
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
        # Espera a que estén LAS DOS cosas, porque la constancia NOM-151 suele
        # llegar después de la evidencia. Y el ciclo tiene tope: a los quince
        # intentos sigue con lo que haya, en vez de dar vueltas para siempre.
        "conditions": [{"id": "avail",
                        "leftValue": "={{ ($json.available && !!$json.nom151) || $runIndex >= 15 }}",
                        "rightValue": True,
                        "operator": {"type": "boolean", "operation": "true", "singleValue": True}}],
        "combinator": "and",
    },
    "options": {},
}, 720, Y2)

wait_ev = node("Wait 1 minute", "n8n-nodes-base.wait", 1.1, {"amount": 60, "unit": "seconds"}, 720, Y2 + 200,
               webhookId=str(uuid.uuid5(uuid.NAMESPACE_URL, "wait-evidence")))

files = node("List files to attach", "n8n-nodes-base.code", 2, {
    "jsCode": (
        "// Un item por archivo que EXISTA. La constancia NOM-151 puede llegar después\n"
        "// que la evidencia, y en sandbox no llega nunca.\n"
        "const ev = $input.first().json;\n"
        "const docId = ev.documentId;\n"
        "const out = [];\n"
        "if (ev.evidencePdf?.url) out.push({ json: { fileName: `${docId}-signed.pdf`, url: ev.evidencePdf.url, kind: 'Signed PDF' } });\n"
        "if (ev.nom151?.url) out.push({ json: { fileName: `${docId}-nom151.pdf`, url: ev.nom151.url, kind: 'NOM-151 certificate' } });\n"
        "if (!out.length) throw new Error(`The evidence for ${docId} was still not ready after 15 minutes`);\n"
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
                               # Lo que se adjuntó de verdad. La constancia NOM-151 puede
                               # tardar más que la evidencia, y en sandbox no llega nunca:
                               # decir siempre que va adjunta sería mentira.
                               "Attached: {{ $('List files to attach').all().map(f => f.json.kind).join(', ') }}.",
                               "{{ $json.fileIds.join(';') }}"))

mark = hs_update("Mark contract as signed", "={{ $('Deal for this contract').first().json.id }}", [
    ("allsign_contract_status", "signed"),
], 2160, Y2)

# El CRM avanza solo: firmado de verdad es el unico momento en que el negocio
# esta ganado. Si tu equipo prefiere mover el embudo a mano, borra este nodo.
won = hs_update("Move the deal to Closed Won", "={{ $('Deal for this contract').first().json.id }}", [
    ("dealstage", "closedwon"),
], 2400, Y2)

notify = node("Tell the team", "n8n-nodes-base.emailSend", 2.1, {
    "fromEmail": "no-reply@example.com",
    "toEmail": "sales@example.com",
    "subject": "=Signed: {{ $('Deal for this contract').first().json.properties.dealname }}",
    "emailFormat": "html",
    "html": "=The contract for <b>{{ $('Deal for this contract').first().json.properties.dealname }}</b> "
            "is signed by all parties.<br><br>Attached to the deal in HubSpot: "
            "{{ $('List files to attach').all().map(f => f.json.kind).join(', ') }}.",
    "options": {},
}, 2640, Y2, cred={"smtp": SMTP_CRED})

# ── Error branch: one place to notice a run that broke ──────────────────
sticky(
    "# Si algo truena\n\n"
    "El **Error Trigger** avisa cuando una corrida termina en error: una credencial mala, "
    "AllSign caído, HubSpot que corta por exceso de llamadas. Cuando un contrato no sale "
    "(el negocio no tiene contacto, el contacto no tiene correo, o AllSign o HubSpot "
    "siguen fallando después de cinco intentos), el negocio queda marcado `error` y la "
    "corrida termina en error a propósito para que el aviso salga. Lo mismo si la "
    "evidencia de un contrato firmado no llega en 15 minutos.\n\n"
    "Solo avisa de las corridas del flujo publicado, no de las que lanzas a mano desde el "
    "editor. Mándalo a donde de verdad lo veas: si prefieres tu chat, cambia el nodo de "
    "correo por el de tu herramienta.",
    -80, Y2 + 520, 560, 260, color=3)

err = node("Something failed", "n8n-nodes-base.errorTrigger", 1, {}, 0, Y2 + 900)
err_msg = node("Report the failure", "n8n-nodes-base.emailSend", 2.1, {
    "fromEmail": "no-reply@example.com",
    "toEmail": "sales@example.com",
    "subject": "AllSign contract workflow failed",
    "emailFormat": "html",
    "html": "=The run failed at <b>{{ $json.execution.lastNodeExecuted }}</b>.<br><br>"
            "{{ $json.execution.error.message }}<br><br>"
            "<a href=\"{{ $json.execution.url }}\">Open the run</a> to see what happened.",
    "options": {},
}, 240, Y2 + 900, cred={"smtp": SMTP_CRED})
link(err, err_msg)

for a, b in [(trig, s2), (s2, ev), (ev, ready), (wait_ev, ev), (files, dl), (dl, up), (up, agg), (agg, note2), (note2, mark), (mark, won), (won, notify)]:
    link(a, b)
link(ready, files, 0)
link(ready, wait_ev, 1)

# ───────────────────────── FLOW 3 — daily reminders ─────────────────────────
Y3 = 2600
sticky(
    "# 3 · Recordatorio diario a quien falta por firmar\n\n"
    "De lunes a viernes a las 9:00, hora de la Ciudad de México (la zona se cambia en la "
    "configuración del flujo), el flujo toma los negocios cuyo contrato sigue en **enviado**, le pregunta "
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
        # Una invitación vigente sale como `sent`; `pending` es la que todavía no
        # se manda. Filtrar solo por `pending` dejaba los recordatorios sin
        # destinatario: no le llegaban a nadie.
        "conditions": [
            {"id": "pend", "leftValue": "={{ $json.status }}", "rightValue": "pending",
             "operator": {"type": "string", "operation": "equals"}},
            {"id": "sent", "leftValue": "={{ $json.status }}", "rightValue": "sent",
             "operator": {"type": "string", "operation": "equals"}},
        ],
        "combinator": "or",
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
    "una línea) y `allsign_contract_status` (desplegable con `created`, `sent`, `signed` "
    "y `error`). Un negocio marcado `error` no se reintenta solo: para reintentarlo, borra "
    "esas dos propiedades a mano. Antes de hacerlo, busca el contrato en AllSign: si ya "
    "existe, no lo reintentes, porque saldría otro y se cobraría dos veces.\n"
    "4. Sube tu contrato como **plantilla** en AllSign y pega su id `tmpl_…` en *Prepare "
    "contract data*. En ese mismo nodo, más abajo, están las que salen de ti y no del "
    "CRM: **empresa_emisora**, **emisor_nombre**, **emisor_correo**, **vigencia**, "
    "**jurisdiccion** y **objeto**. Las tres primeras van vacías a propósito: si no las "
    "llenas, AllSign rechaza el contrato con un 422 y te enteras, en vez de mandarle a tu "
    "cliente un acuerdo con un texto de ejemplo. El correo del emisor tiene que ser "
    "distinto al del cliente: la API no acepta dos firmantes con el mismo.\n"
    "5. En AllSign, dile a la plantilla dónde van las firmas. Una sola vez, con "
    "`PUT /v3/templates/{tuPlantilla}/signing` y este cuerpo:\n"
    "```json\n"
    "{\"roles\": [\n"
    "  {\"name\": \"emisor\",  \"fields\": [{\"roleName\": \"emisor\",  \"kind\": \"signature\", \"page\": 3,\n"
    "     \"rect\": {\"x\": 8,  \"y\": 30, \"width\": 35, \"height\": 7},\n"
    "     \"anchor\": \"Firma de la Parte emisora\", \"expect\": 1, \"onMiss\": \"fail\"}]},\n"
    "  {\"name\": \"cliente\", \"fields\": [{\"roleName\": \"cliente\", \"kind\": \"signature\", \"page\": 3,\n"
    "     \"rect\": {\"x\": 55, \"y\": 30, \"width\": 35, \"height\": 7},\n"
    "     \"anchor\": \"Firma de la Parte cliente\", \"expect\": 1, \"onMiss\": \"fail\"}]}\n"
    "]}\n"
    "```\n"
    "Sin esto, AllSign pone las firmas al pie de la **primera** página, encima de las "
    "cláusulas. Los textos del `anchor` son los que trae el acuerdo de este repo; si usas "
    "otro documento, pon los tuyos y que aparezcan una sola vez.\n"
    "En este repo, "
    "`examples/NDA_Plantilla_AllSign_ES.docx` es un acuerdo de confidencialidad en español "
    "con esas mismas variables.\n"
    "6. Los dos nodos de correo traen direcciones de ejemplo (`sales@example.com`) que "
    "rebotan. Conecta tu servidor de correo y pon tu remitente y tu destinatario, o "
    "bórralos.\n"
    "7. Publica el flujo. Mueve un negocio a **Contrato enviado** y velo salir. Los que ya "
    "estaban en esa etapa al publicarlo no reciben contrato.\n\n"
    "**Dos valores que importan más de lo que parecen.** `vigencia` tiene que traer la "
    "unidad, por ejemplo *dos años*, porque el contrato dice \"por un plazo de…\". Y "
    "`jurisdiccion` tiene que ser el domicilio de alguna de las dos empresas o el lugar "
    "donde se cumple el acuerdo: si pones una ciudad sin relación con ninguna, la "
    "sumisión a esos tribunales puede no valer.\n\n"
    "**¿Otro embudo?** Las etapas `contractsent` y `closedwon` son las del embudo que "
    "HubSpot trae de fábrica. Si usas uno propio, cambia `contractsent` por el "
    "identificador de tu etapa en *Deals ready for their contract* (en el filtro de la "
    "etapa, en `" + ENTRO_A_LA_ETAPA + "` y en las propiedades que lee) y en el campo "
    "`fecha_efectiva` de *Prepare contract data*; y `closedwon` en *Move the deal to Closed "
    "Won*. El identificador de tu etapa sale de HubSpot, en la configuración del embudo.\n\n"
    "**¿Correo o WhatsApp?** Sale por correo. Para mandarlo por WhatsApp abre *Prepare "
    "contract data*, campo `channel`, y en la primera línea cambia `prefiere` de `email` a "
    "`whatsapp`. Para WhatsApp el teléfono tiene que traer la lada (`+52…`) o poder "
    "completarse con la del país que traiga el contacto en HubSpot; si no se puede, ese "
    "contrato se va por correo en lugar de fallar. El correo del contacto hace falta "
    "siempre: el contrato lo lleva escrito.",
    620, Y1 - 560, 780, 520, color=6)

workflow = {
    "name": "Close HubSpot deals with NOM-151 compliant e-signature, by email or WhatsApp",
    "nodes": nodes,
    "connections": connections,
    "settings": {"executionOrder": "v1", "timezone": "America/Mexico_City"},
    "meta": {"templateCredsSetupCompleted": False},
}
print(json.dumps(workflow, indent=2, ensure_ascii=False))
