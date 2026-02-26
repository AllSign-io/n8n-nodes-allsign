# 🤝 AllSign n8n Node — Handover Guide

> **Fecha:** 26 Feb 2026  
> **Repo:** `https://github.com/httpmfs/n8n-nodes-starter.git`  
> **Branch:** `mvp/v1-create-send` (último commit: `7ec8402`)  
> **Contacto:** erikasofia.garciabalderas@gmail.com

---

## 🎯 ¿Qué es esto?

Un **nodo comunitario de n8n** que conecta workflows de automatización con la plataforma **AllSign** de firma electrónica. Permite crear y enviar documentos para firma desde n8n usando la API v2 de AllSign.

---

## 📊 Estado Actual

### ✅ Listo (funcional y testeado)

| Componente          | Estado | Detalles                                             |
| ------------------- | ------ | ---------------------------------------------------- |
| **AllSign Node**    | ✅     | 1 operación (**Create & Send**) con flujo de 2 pasos |
| **AllSign Trigger** | ✅     | 4 eventos webhook con HMAC-SHA256                    |
| **Credenciales**    | ✅     | API Key + Base URL configurable + test automático    |
| **Tests**           | ✅     | **25/25 pasando**                                    |
| **Build**           | ✅     | TypeScript compila sin errores                       |
| **README**          | ✅     | Bilingüe EN/ES, documentación completa               |
| **CHANGELOG**       | ✅     | v1.0.0 documentado                                   |
| **Codex/SEO**       | ✅     | 28+ aliases para marketplace                         |

### 🔧 Arquitectura del flujo Create & Send (2 pasos)

El nodo usa un flujo de 2 pasos para crear y enviar documentos:

1. **POST /v2/documents/** — Crea el documento con `sendInvitations: false`
2. **POST /v2/documents/{id}/invite-bulk** — Envía invitaciones (email y/o WhatsApp)

Esto se hace así para usar el nuevo flujo de GuestSession con plantillas correctas de WhatsApp.

### ⏳ Pendiente (futuras iteraciones)

| Operación                          | Notas                                        |
| ---------------------------------- | -------------------------------------------- |
| Document → Get, List, Download     | Operaciones CRUD adicionales                 |
| Document → Void, Update, Delete    | Gestión de documentos                        |
| Folders management (CRUD)          | Ya testeado en versiones anteriores del nodo |
| Contacts management (CRUD)         | Ya testeado en versiones anteriores del nodo |
| Signer, Signature Field operations | Dependen de Get by ID (bug backend conocido) |
| Templates                          | Cuando `GET /v2/templates` esté disponible   |

---

## 🚀 Cómo Levantar el Proyecto

```bash
# 1. Clonar
git clone https://github.com/httpmfs/n8n-nodes-starter.git n8n-nodes-allsign
cd n8n-nodes-allsign

# 2. Cambiar al branch MVP
git checkout mvp/v1-create-send

# 3. Instalar
npm install

# 4. Correr en modo desarrollo (abre n8n en http://localhost:5678)
npm run dev

# 5. Correr tests
npm test

# 6. Build para producción
npm run build
```

---

## 🔑 Credenciales de Prueba

### API Key (cuenta de erikasofia.garciabalderas@gmail.com)

```
allsign_live_sk_kMg9wSccFJVzRB063jsGu1RMqI5Uj8GuZPVn3Mg2NW4
```

### Configurar en n8n:

1. Abrir n8n → Credentials → AllSign API
2. **API Key:** (la de arriba)
3. **Base URL:** `http://127.0.0.1:8000` (local) o el dominio cuando esté listo
4. Guardar → debe decir "Connection tested successfully"

### IDs importantes

| Item      | Valor                                  |
| --------- | -------------------------------------- |
| Tenant ID | `623d9e59-86e0-4f7b-bca2-161e66b81624` |
| User ID   | `fa9c7025-b70d-4a3f-9ea5-cd51e6d682fb` |
| Email     | `erikasofia.garciabalderas@gmail.com`  |

---

## 📂 Estructura del Proyecto

```
n8n-nodes-allsign/
├── credentials/
│   ├── AllSignApi.credentials.ts    ← Credencial (API Key + Base URL)
│   └── allsign.svg                  ← Ícono de la credencial
├── nodes/
│   ├── Allsign/
│   │   ├── Allsign.node.ts          ← NODO PRINCIPAL (Create & Send)
│   │   ├── Allsign.node.test.ts     ← Tests (25 tests)
│   │   ├── Allsign.node.json        ← Codex/SEO metadata
│   │   └── allsign.svg              ← Ícono del nodo
│   └── AllsignTrigger/
│       ├── AllsignTrigger.node.ts    ← Trigger webhook (4 eventos)
│       ├── AllsignTrigger.node.json  ← Codex del trigger
│       └── allsign.svg              ← Ícono del trigger
├── CHANGELOG.md                     ← Historial de cambios
├── README.md                        ← Documentación principal
├── release_notes.md                 ← Notas v1.0.0 MVP
├── package.json                     ← Dependencias y config npm
├── tsconfig.json                    ← Config TypeScript
└── jest.config.js                   ← Config tests
```

---

## 🔧 Operación Implementada: Create & Send

### Flujo

```
Usuario en n8n → Configura parámetros → Ejecuta
    ↓
1. Obtener archivo (descarga desde URL o lee datos binarios)
    ↓
2. POST /v2/documents/ (crea documento, sendInvitations: false)
    ↓
3. POST /v2/documents/{id}/invite-bulk (envía invitaciones)
    ↓
Resultado: documento creado + invitaciones enviadas
```

### Parámetros del nodo

| Parámetro             | Tipo          | Descripción                                        |
| --------------------- | ------------- | -------------------------------------------------- |
| Document Name         | string        | Nombre del documento                               |
| File Source           | binary \| url | Origen del archivo PDF                             |
| Signers               | collection    | Lista de firmantes (nombre, email, WhatsApp)       |
| Signature Fields      | collection    | Posicionamiento de campos de firma (coords/anchor) |
| Send Invitations      | boolean       | Enviar invitaciones a firmantes                    |
| Send by Email         | boolean       | Enviar invitación por email                        |
| Send by WhatsApp      | boolean       | Enviar invitación por WhatsApp                     |
| Autógrafa             | boolean       | Firma manuscrita digital                           |
| FEA                   | boolean       | Firma Electrónica Avanzada                         |
| NOM-151               | boolean       | Sellado de tiempo certificado                      |
| Video Signature       | boolean       | Grabación de video                                 |
| Confirm Name          | boolean       | Escribir nombre completo                           |
| Identity Verification | boolean       | Verificación de identidad (padre)                  |
| └ ID Scan             | boolean       | Escaneo de identificación                          |
| └ Biometric Selfie    | boolean       | Selfie biométrica                                  |
| └── SynthID           | boolean       | Detección de IA                                    |

---

## 🔐 7 Tipos de Firma Soportados

1. **Autógrafa** → `autografa`
2. **FEA** → `FEA`
3. **NOM-151** → `nom151`
4. **Video Signature** → `biometric_signature`
5. **Confirm Name** → `confirm_name_to_finish`
6. **AI Verification (SynthID)** → `ai_verification`
7. **Identity Verification** → ID Scan + Biometric Selfie (habilita `ai_verification`)

---

## 🐛 Bugs Conocidos del Backend

1. **`GET /v2/documents/{id}`** → 404 aunque el doc exista. El backend filtra por `orgId` de forma inconsistente con `GET /v2/documents`.
2. **`GET /v2/documents/stats`** → 500 con error `get_document_stats() got an unexpected keyword argument 'scope'`.
3. **`PATCH /v2/contacts/{id}`** → Actualiza pero devuelve respuesta sin los campos actualizados.

> ⚠️ Estos son bugs del **backend FastAPI**, no del nodo n8n.

---

## 📊 Historial de Branches

| Branch               | Descripción                                          | Estado    |
| -------------------- | ---------------------------------------------------- | --------- |
| `master`             | Base original del starter kit                        | Estable   |
| `mvp/v1-create-send` | **← BRANCH ACTUAL** MVP con Create & Send + WhatsApp | Activo ✅ |

### Commits relevantes en `mvp/v1-create-send`

```
7ec8402 feat: add WhatsApp invitations, signature field placement, and invite-bulk flow
cf098d4 feat: V2 API MVP - Autografa toggle, cleaned UI, full tests
2359357 feat: MVP v1 - simplified node with only Create and Send operations
```

---

## 📋 Próximos Pasos

1. **Probar con backend real** — conectarse al backend y verificar Create & Send end-to-end
2. **Cloudflare Tunnel** — para pruebas de webhooks del Trigger node
3. **Agregar operaciones CRUD** — Get, List, Download, Delete documentos
4. **Corregir bugs del backend** (Get by ID, Get Stats)
5. **Publicar en npm** cuando todo esté verificado: `npm publish`

---

## 📚 Referencias

- [AllSign Platform](https://allsign.io)
- [AllSign API Docs](https://docs.allsign.io)
- [n8n Node Development](https://docs.n8n.io/integrations/creating-nodes/)
- [n8n Community Forum](https://community.n8n.io/)
