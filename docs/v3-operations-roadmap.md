# Roadmap — operaciones del nodo n8n (AllSign API v3)

Orden propuesto para ir sumando operaciones al nodo `n8n-nodes-allsign` (v3).
Empezamos por Create Document (v0.2.0). Israel confirma el orden final.

## Tier 1 — flujo core (publicar con esto)
1. **Create Document** — `POST /v3/documents` — ✅ HECHO (v0.2.0)
2. **Send Document** — `POST` `sendDocument` — mandar a firma. Completa el flujo crear→enviar.
3. **Get Document** — `GET /v3/documents/{id}` `getDocument` — consultar estado (¿ya firmaron?). Muy usado en automatizaciones (polling).

## Tier 2 — gestión común
4. **List Documents** — `GET /v3/documents` `listDocuments`
5. **Remind Signer** — `remindSigner` — recordatorio manual a un firmante.
6. **Void Document** — `voidDocument` — cancelar/anular.
7. **Get Evidence** — `getDocumentEvidence` — descargar la constancia NOM-151 (cumplimiento).
8. **List Signers** — `listDocumentSigners`.

## Tier 3 — avanzado / event-driven
9. **Webhook Trigger (nodo Trigger)** — dispara el workflow cuando firman/completan. Lo más potente para n8n (recurso `webhooks`). Es un nodo Trigger aparte, más trabajo.
10. **Bulk Send** — `createBulkSend` + `getBulkSend` — mismo PDF a N destinatarios (async).
11. **Templates** — recurso `templates` — listar/usar plantillas por nombre.
12. **Update / List Events / Stats / Bulk Delete** — `updateDocument`, `listDocumentEvents`, `getDocumentStats`, `bulkDeleteDocuments`.

## Otros recursos v3 (para más adelante)
`analytics`, `devassist`, `folders`, `signing_sessions`, `users`.

---
Fuente: `allsign-backend-fastapi` `origin/beta:app/api/v3/documents/router.py` (15 ops de documents) + routers v3.
