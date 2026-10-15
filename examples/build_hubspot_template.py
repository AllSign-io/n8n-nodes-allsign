#!/usr/bin/env python3
"""Genera el workflow "HubSpot Closed Won → AllSign contract" para n8n.

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
# Arranque en tiempo real: HubSpot avisa en vez de que nosotros preguntemos.
WEBHOOK = "--webhook" in sys.argv

# El modo --local inyecta las credenciales y la plantilla de QUIEN lo corra, no
# las de nadie en particular: salen del entorno. Antes venían escritas aquí, y
# eso dejaba ids de una cuenta concreta dentro de un repo público.
def _del_entorno(variable, por_defecto=""):
    return os.environ.get(variable, por_defecto) if LOCAL else por_defecto


HUBSPOT_CRED = {"id": _del_entorno("N8N_CRED_HUBSPOT"), "name": "HubSpot App Token"}
SMTP_CRED = {"id": _del_entorno("N8N_CRED_SMTP"), "name": "SMTP account"}
ALLSIGN_CRED = {"id": _del_entorno("N8N_CRED_ALLSIGN"), "name": "AllSign API"}
TEMPLATE_ID = _del_entorno("ALLSIGN_TEMPLATE_ID", "tmpl_REPLACE_ME")

# n8n guarda la ruta de cada disparador en una tabla global: si las dos plantillas
# piden la misma, la segunda que prendas se queda sin registrar. Cada plantilla
# estrena las suyas.
def wh(nombre):
    return str(uuid.uuid5(uuid.NAMESPACE_URL, nombre + ("-realtime" if WEBHOOK else "")))

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


# ───────────────────────── FLOW 1 — Closed Won → send contract ─────────────────────────
Y1 = 300
sticky(
    "# 1 · El negocio avanza → sale el contrato\n\n" + (
        "HubSpot avisa en el momento en que un negocio pasa a **Contrato enviado**. El flujo "
        "lee el negocio, descarta los que ya tienen contrato, arma el documento con tu "
        "plantilla de AllSign y se lo manda al contacto. Mover el negocio a esa etapa es "
        "justo lo que el vendedor ya hace cuando manda un contrato.\n\n"
        if WEBHOOK else
        "Cada 5 minutos el flujo le pregunta a HubSpot por los negocios en **Contrato "
        "enviado** que todavía no tienen contrato de AllSign, arma el documento con tu "
        "plantilla y se lo manda al contacto. Mover el negocio a esa etapa es justo lo que "
        "el vendedor ya hace cuando manda un contrato.\n\n") +
    "La invitación va por **WhatsApp** cuando el teléfono del contacto se puede completar "
    "con la lada de su país, y por **correo** cuando no: mandar medio número no le llega a "
    "nadie. El negocio guarda el id y el estado del contrato "
    "(`allsign_document_id`, `allsign_contract_status`) para no mandarlo dos veces.",
    -80, Y1 - 420, 620, 340, color=4)

def _cond(cid, left, right, operation="equals", type_="string", **extra):
    op = {"type": type_, "operation": operation}
    op.update(extra)
    return {"id": cid, "leftValue": left, "rightValue": right, "operator": op}


def _filter(name, conditions, x, y):
    return node(name, "n8n-nodes-base.filter", 2.2, {
        "conditions": {
            "options": {"caseSensitive": True, "leftValue": "", "typeValidation": "strict", "version": 2},
            "conditions": conditions,
            "combinator": "and",
        },
        "options": {},
    }, x, y)


if WEBHOOK:
    # Esta direccion es publica: cualquiera que la conozca puede llamarla. Lo
    # unico que separa un aviso de HubSpot de uno inventado es la firma, asi que
    # se verifica antes de mirar el contenido. Sin esto, con la direccion y el
    # numero de un negocio se pueden mandar contratos reales, y cobrados.
    t1 = node("HubSpot calls when a deal changes", "n8n-nodes-base.webhook", 2, {
        "httpMethod": "POST",
        # La ruta la eliges tu al instalar. Si sale de un texto fijo, cualquiera
        # la calcula leyendo este repo.
        "path": "cambia-esto-por-algo-tuyo",
        "responseMode": "responseNode",
        "options": {"rawBody": True},
    }, -1200, Y1, webhookId=wh("hubspot-deal-closed"))

    # Un nodo Code no puede usar `crypto`: n8n no le presta ningún módulo de Node
    # a menos que el administrador lo habilite. Por eso la firma se calcula con
    # el nodo Crypto, que viene de fábrica.
    datos = node("Signature inputs", "n8n-nodes-base.set", 3.4, {
        "mode": "manual",
        "assignments": {"assignments": [
            # ↓↓↓ PEGA AQUÍ el secreto de cliente de tu aplicación privada de
            # HubSpot. Está en su pestaña Auth, y NO es el token pat-… ↓↓↓
            {"id": "b1", "name": "secreto", "type": "string", "value": ""},
            {"id": "b2", "name": "cuerpo", "type": "string",
             "value": "={{ $json.rawBody?.toString() ?? JSON.stringify($json.body) }}"},
            {"id": "b3", "name": "firmaV1", "type": "string",
             "value": "={{ $json.headers['x-hubspot-signature'] ?? '' }}"},
            {"id": "b4", "name": "firmaV3", "type": "string",
             "value": "={{ $json.headers['x-hubspot-signature-v3'] ?? '' }}"},
            {"id": "b5", "name": "marca", "type": "string",
             "value": "={{ $json.headers['x-hubspot-request-timestamp'] ?? '' }}"},
            # Lo que HubSpot firma en cada versión. En la v1 es el secreto pegado
            # al cuerpo; en la v3, el método, la dirección, el cuerpo y la hora.
            {"id": "b6", "name": "aFirmar", "type": "string",
             "value": "={{ $json.headers['x-hubspot-signature-v3'] "
                      "? 'POST' + $json.webhookUrl + ($json.rawBody?.toString() ?? JSON.stringify($json.body)) + $json.headers['x-hubspot-request-timestamp'] "
                      ": '' }}"},
            {"id": "b7", "name": "vigente", "type": "boolean",
             "value": "={{ !$json.headers['x-hubspot-signature-v3'] "
                      "|| Math.abs(Date.now() - Number($json.headers['x-hubspot-request-timestamp'])) <= 300000 }}"},
        ]},
        "options": {},
    }, -960, Y1)

    esv3 = node("Which signature version?", "n8n-nodes-base.if", 2.2, {
        "conditions": {
            "options": {"caseSensitive": True, "leftValue": "", "typeValidation": "strict", "version": 2},
            "conditions": [{"id": "v3", "leftValue": "={{ $json.firmaV3 }}", "rightValue": "",
                            "operator": {"type": "string", "operation": "notEmpty", "singleValue": True}}],
            "combinator": "and",
        },
        "options": {},
    }, -720, Y1)

    hmac3 = node("Sign it the v3 way", "n8n-nodes-base.crypto", 1, {
        "action": "hmac",
        "type": "SHA256",
        "value": "={{ $json.aFirmar }}",
        "dataPropertyName": "calculada",
        "secret": "={{ $json.secreto }}",
        "encoding": "base64",
    }, -480, Y1 - 180)

    hash1 = node("Sign it the v1 way", "n8n-nodes-base.crypto", 1, {
        "action": "hash",
        "type": "SHA256",
        "value": "={{ $json.secreto + $json.cuerpo }}",
        "dataPropertyName": "calculada",
        "encoding": "hex",
    }, -480, Y1 + 180)

    es_valida = node("Signature checks out?", "n8n-nodes-base.if", 2.2, {
        "conditions": {
            "options": {"caseSensitive": True, "leftValue": "", "typeValidation": "strict", "version": 2},
            "conditions": [
                {"id": "hay", "leftValue": "={{ $json.secreto }}", "rightValue": "",
                 "operator": {"type": "string", "operation": "notEmpty", "singleValue": True}},
                {"id": "fresca", "leftValue": "={{ $json.vigente }}", "rightValue": True,
                 "operator": {"type": "boolean", "operation": "true", "singleValue": True}},
                {"id": "cuadra",
                 "leftValue": "={{ $json.calculada }}",
                 "rightValue": "={{ $json.firmaV3 || $json.firmaV1 }}",
                 "operator": {"type": "string", "operation": "equals"}},
            ],
            "combinator": "and",
        },
        "options": {},
    }, -240, Y1)

    # HubSpot reintenta hasta diez veces en 24 horas si recibe un 4xx o 5xx, o si
    # tardas más de cinco segundos. Por eso se contesta de inmediato y el trabajo
    # sigue por su cuenta.
    ok200 = node("Thanks, got it", "n8n-nodes-base.respondToWebhook", 1.1, {
        "respondWith": "noData", "options": {"responseCode": 200},
    }, 720, Y1 + 300)

    no401 = node("Not HubSpot — refuse", "n8n-nodes-base.respondToWebhook", 1.1, {
        "respondWith": "text", "responseBody": "invalid signature",
        "options": {"responseCode": 401},
    }, 480, Y1 + 300)

    split1 = node("One item per event", "n8n-nodes-base.splitOut", 1, {
        "fieldToSplitOut": "body", "options": {},
    }, 0, Y1)

    onlywon = _filter("Moved to Contract Sent?", [
        _cond("prop", "={{ $json.propertyName }}", "dealstage"),
    ], 240, Y1)

    # Se vuelve a leer el negocio en HubSpot en vez de creerle al aviso: el
    # cuerpo dice en que etapa quedo, pero eso solo lo confirma la fuente.
    s1 = hs_http("The deal that just moved", "GET",
                 "=" + HS + "/crm/v3/objects/deals/{{ $json.objectId }}"
                 "?properties=dealname,amount,closedate,allsign_document_id,"
                 "allsign_contract_status,dealstage", 480, Y1)

    fresh = _filter("Really in Contract Sent, with no contract?", [
        _cond("etapa", "={{ $json.properties.dealstage }}", "contractsent"),
        _cond("nodoc", "={{ $json.properties.allsign_document_id }}", "",
              operation="empty", singleValue=True),
        _cond("noestado", "={{ $json.properties.allsign_contract_status }}", "",
              operation="empty", singleValue=True),
    ], 720, Y1)

    START_CHAIN = [(t1, datos), (datos, esv3), (hmac3, es_valida), (hash1, es_valida),
                   (es_valida, split1), (split1, onlywon), (onlywon, s1), (s1, fresh)]
    # el cableado de las dos respuestas va más abajo, con el resto del flujo
    ENTRY = fresh  # el nodo que le pasa el deal al resto del flujo
else:
    t1 = node("Every 5 minutes", "n8n-nodes-base.scheduleTrigger", 1.2,
              {"rule": {"interval": [{"field": "minutes", "minutesInterval": 5}]}}, 0, Y1)

    s1 = hs_search("Deals ready for their contract", [
        {"propertyName": "dealstage", "operator": "EQ", "value": "contractsent"},
        {"propertyName": "allsign_document_id", "operator": "NOT_HAS_PROPERTY"},
        # Un negocio marcado como `error` no se reintenta solo cada cinco minutos.
        # Para reintentarlo, una persona borra el estado y el id a mano.
        {"propertyName": "allsign_contract_status", "operator": "NOT_HAS_PROPERTY"},
    ], ["dealname", "amount", "closedate", "allsign_document_id"], 240, Y1)

    START_CHAIN = [(t1, s1)]
    ENTRY = s1

DEAL = s1  # el nodo que trae el deal, se llama distinto en cada variante

X1 = 960 if WEBHOOK else 480   # el arranque en tiempo real ocupa más a la izquierda

c1 = hs_http("Contact linked to the deal", "GET",
             "=" + HS + "/crm/v4/objects/deals/{{ $json.id }}/associations/contacts", X1, Y1)

if1 = node("Deal has a contact?", "n8n-nodes-base.if", 2.2, {
    "conditions": {
        "options": {"caseSensitive": True, "leftValue": "", "typeValidation": "strict", "version": 2},
        "conditions": [{"id": "has-contact", "leftValue": "={{ $json.results.length }}",
                        "rightValue": 0, "operator": {"type": "number", "operation": "gt"}}],
        "combinator": "and",
    },
    "options": {},
}, X1 + 240, Y1)

c2 = hs_http("Contact details", "GET",
             "=" + HS + "/crm/v3/objects/contacts/{{ $json.results[0].toObjectId }}"
             "?properties=firstname,lastname,email,phone,mobilephone,company,country", X1 + 480, Y1)

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
                  "  const dial = { Mexico: '52', 'M\u00e9xico': '52', 'United States': '1', Canada: '1',\n"
                  "                 Spain: '34', 'Espa\u00f1a': '34', Colombia: '57', Argentina: '54',\n"
                  "                 Chile: '56', Peru: '51', 'Per\u00fa': '51', Brazil: '55' };\n"
                  "  const code = dial[($json.properties.country || '').trim()];\n"
                  "  const digits = raw.replace(/\\D/g, '');\n"
                  "  return code ? '+' + code + digits : '';\n"
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
         "value": "la evaluación de una posible relación comercial"},    ]},
    "options": {},
}, X1 + 720, Y1)

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
}, X1 + 960, Y1)

create = allsign("Create contract in AllSign", {
    "operation": "createDocument",
    "documentName": "=Contract — {{ $json.dealName }}",
    "source": "template",
    "templateId": "={{ $json.templateId }}",
    "templateValues": "={{ JSON.stringify({ nombre_cliente: $json.contactName, "
                      "empresa_cliente: $json.company || $json.dealName, correo_cliente: $json.email, "
                      "objeto: $json.objeto, fecha_efectiva: $today.toFormat('dd/MM/yyyy'), "
                      "empresa_emisora: $json.empresa_emisora, vigencia: $json.vigencia, "
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
    ]},    "signatureValidations": {"verifyAutografa": True, "verifyNom151": True},
    "configuration": {"idempotencyKey": clave("allsign-hubspot-create", "$json.dealId")},
}, X1 + 1440, Y1, onError="continueErrorOutput")

# Guardar el id ANTES de enviar. Si el envío falla y el id no estaba guardado,
# el ciclo siguiente no encuentra el contrato, crea otro y cobra otra vez.
save_created = hs_update("Save contract ID on the deal", "={{ $('Prepare contract data').item.json.dealId }}", [
    ("allsign_document_id", "={{ $('Create contract in AllSign').item.json.id }}"),
    ("allsign_contract_status", "created"),
], X1 + 1680, Y1, onError="continueErrorOutput")

send = allsign("Send for signature", {
    "operation": "sendDocument",
    # El documento ya no llega por la entrada: ahora entra el deal. El id se lee
    # del nodo que lo creó.
    "documentId": "={{ $('Create contract in AllSign').item.json.id }}",
    "idempotencyKey": clave("allsign-hubspot-send", "$('Create contract in AllSign').item.json.id"),
}, X1 + 1920, Y1, onError="continueErrorOutput")

save_sent = hs_update("Mark contract as sent", "={{ $('Prepare contract data').item.json.dealId }}", [
    ("allsign_contract_status", "sent"),
], X1 + 2160, Y1)

note1 = hs_http("Log 'contract sent' on the deal", "POST", HS + "/crm/v3/objects/notes", X1 + 2400, Y1,
                body=note_body("{{ $('Prepare contract data').item.json.dealId }}",
                               "Contract sent for signature via AllSign ({{ $('Create contract in AllSign').item.json.id }}) "
                               "by {{ $('Prepare contract data').item.json.channel }} to {{ $('Prepare contract data').item.json.contactName }}."))

# Todo lo que puede fallar termina aquí, y el negocio queda marcado. Así nadie se
# queda esperando un contrato que nunca salió, y el reloj no lo reintenta solo.
failed = hs_update("Mark deal as failed", "={{ $('" + DEAL + "').item.json.id }}", [
    ("allsign_contract_status", "error"),
], X1 + 1680, Y1 + 260)

for a, b in START_CHAIN + [(ENTRY, c1), (c1, if1), (c2, prep), (prep, sw),
                           (create, save_created), (save_created, send),
                           (send, save_sent), (save_sent, note1)]:    link(a, b)
link(if1, c2, 0)
if WEBHOOK:
    # La salida 0 del IF es la firma buena: contesta 200 y sigue. La 1 es la
    # mala: contesta 401 y ahí termina.
    link(esv3, hmac3, 0)   # trae firma v3
    link(esv3, hash1, 1)   # solo trae la v1, que es la de las apps privadas
    link(es_valida, ok200, 0)
    link(es_valida, no401, 1)
link(sw, create, 0)
link(sw, create, 1)
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
}, 0, Y2, cred={"allSignApi": ALLSIGN_CRED}, webhookId=wh("allsign-hubspot-trigger"))

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
               webhookId=wh("wait-evidence"))

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
            "is signed by all parties.<br><br>The signed PDF and the NOM-151 certificate are attached "
            "to the deal in HubSpot.",
    "options": {},
}, 2640, Y2, cred={"smtp": SMTP_CRED})

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

for a, b in [(trig, s2), (s2, ev), (ev, ready), (wait_ev, ev), (files, dl), (dl, up), (up, agg), (agg, note2), (note2, mark), (mark, won), (won, notify)]:
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
             webhookId=wh("wait-remind"))

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
    "esas dos propiedades a mano.\n"
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
    "     \"anchor\": \"Firma por la empresa\", \"expect\": 1, \"onMiss\": \"fail\"}]},\n"
    "  {\"name\": \"cliente\", \"fields\": [{\"roleName\": \"cliente\", \"kind\": \"signature\", \"page\": 3,\n"
    "     \"rect\": {\"x\": 55, \"y\": 30, \"width\": 35, \"height\": 7},\n"
    "     \"anchor\": \"Firma por el cliente\", \"expect\": 1, \"onMiss\": \"fail\"}]}\n"
    "]}\n"
    "```\n"
    "Sin esto, AllSign pone las firmas al pie de la **primera** página, encima de las "
    "cláusulas. Los textos del `anchor` son los que trae el acuerdo de este repo; si usas "
    "otro documento, pon los tuyos y que aparezcan una sola vez.\n"    "En este repo, "
    "`examples/NDA_Plantilla_AllSign_ES.docx` es un acuerdo de confidencialidad en español "
    "con esas mismas variables.\n"
    "6. Los dos nodos de correo traen direcciones de ejemplo (`sales@example.com`) que "
    "rebotan. Conecta tu servidor de correo y pon tu remitente y tu destinatario, o "
    "bórralos.\n"
    "7. Publica el flujo. Mueve un negocio a **Contrato enviado** y velo salir.\n\n" +
    ("8. Abre el nodo *HubSpot calls when a deal changes* y **cambia la ruta** por algo "
     "tuyo. Viene con un texto de relleno a propósito: si la dejas, cualquiera que lea "
     "este repo puede adivinar tu dirección.\n"
     "9. En la aplicación privada, pestaña **Auth**, copia el **secreto de cliente**. No "
     "es el token `pat-…`. Pégalo en la primera línea del nodo *Is it really HubSpot?*, "
     "donde dice `let secreto = ''`. Sin él, el flujo rechaza todos los avisos.\n"
     "   Si prefieres no dejarlo escrito en el flujo, ponlo en la variable de entorno "
     "`HUBSPOT_CLIENT_SECRET` y arranca n8n con `N8N_BLOCK_ENV_ACCESS_IN_NODE=false`. "
     "Por defecto n8n no deja que un nodo Code lea el entorno, así que sin esa bandera "
     "no funciona.\n"
     "10. En esa misma aplicación abre la pestaña **Webhooks**, pega como URL de destino "
     "la dirección de producción de ese nodo y suscríbete a **Negocio → Propiedad "
     "modificada → Deal Stage**. No hace falta cuenta de desarrollador ni aplicación "
     "pública. El flujo tiene que estar publicado antes, si no la dirección todavía no "
     "contesta.\n\n"
     "**Por qué tanto cuidado:** esa dirección es pública y quien la conozca puede "
     "llamarla. Con ella y el número de un negocio, alguien de fuera podría mandar "
     "contratos de verdad, y cobrados. Por eso el flujo verifica la firma de HubSpot "
     "antes de mirar el contenido, y vuelve a leer el negocio en HubSpot en lugar de "
     "creerle al aviso.\n\n" if WEBHOOK else "") +
    "**¿Otro embudo?** Las etapas `contractsent` y `closedwon` son las del embudo que "
    "HubSpot trae de fábrica. Si usas uno propio, cambia la etapa en dos nodos: la que "
    "busca los negocios al principio, y *Move the deal to Closed Won* al final. El "
    "identificador de tu etapa sale de HubSpot, en la configuración del embudo.\n\n"    "**¿Correo o WhatsApp?** Lo eliges tú: abre *Prepare contract data*, campo `channel`, "
    "y en la primera línea cambia `prefiere` de `email` a `whatsapp`. Para WhatsApp el "
    "teléfono tiene que poder completarse con la lada del país que traiga el contacto en "
    "HubSpot; si no se puede, ese contrato se va por correo en lugar de fallar.",
    620, Y1 - 560, 780, 520, color=6)

workflow = {
    "name": "Close HubSpot deals with NOM-151 compliant e-signature and WhatsApp delivery"
            + (" — real time" if WEBHOOK else ""),
    "nodes": nodes,
    "connections": connections,
    "settings": {"executionOrder": "v1"},
    "meta": {"templateCredsSetupCompleted": False},
}
print(json.dumps(workflow, indent=2, ensure_ascii=False))
