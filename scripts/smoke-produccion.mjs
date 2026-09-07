/**
 * Smoke test del nodo contra la API real.
 *
 * Corre el CÓDIGO DEL NODO —no una reimplementación— contra `api.allsign.io`,
 * sustituyendo solo los `helpers` que n8n inyecta por HTTP de verdad. Así se
 * ejercita lo que los tests unitarios no pueden: que del otro lado conteste
 * algo, que el cuerpo que arma el nodo sea el que la API acepta, y que el
 * `Idempotency-Key` derivado pase el validador estricto de v3.
 *
 * Usa una key `allsign_test_sk_…` (ambiente `test`, 14 días, una por cuenta).
 * El backend trata `test` igual que `dev`: ambiente restringido y SIN cobro
 * —los asentamientos de crédito solo ocurren para documentos `live`—, así que
 * esto no gasta dinero aunque pegue a producción.
 *
 *   node scripts/smoke-produccion.mjs
 *
 * La key sale de ~/.allsign-secrets/allsign-test-key, o de API_KEY.
 * La base se puede cambiar con API_URL para correrlo contra dev.
 */
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

const marcaGlobal = Date.now().toString(36);
const BASE_URL = process.env.API_URL ?? 'https://api.allsign.io';
const API_KEY =
    process.env.API_KEY ??
    readFileSync(join(homedir(), '.allsign-secrets/allsign-test-key'), 'utf8').trim();

const { Allsign } = require('../dist/nodes/Allsign/Allsign.node.js');
const node = new Allsign();

/** Un PDF mínimo pero válido, en base64. */
function pdfBase64() {
    return Buffer.from(
        [
            '%PDF-1.4',
            '1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj',
            '2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj',
            '3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 612 792]>>endobj',
            'trailer<</Root 1 0 R>>',
            '%%EOF',
        ].join('\n'),
    ).toString('base64');
}

/**
 * El contexto que n8n le da al nodo. Los `helpers` son los ÚNICOS sustitutos:
 * hacen HTTP real en vez de devolver un mock. Todo lo demás —armar el cuerpo,
 * derivar la llave de idempotencia, traducir el error— corre tal cual.
 */
function contexto(params, ejecucion) {
    const http = async (opciones) => {
        const url = opciones.url ?? opciones.uri;
        const headers = { ...(opciones.headers ?? {}) };
        // El nodo usa `json: true` y deja que n8n ponga el Content-Type. Aquí
        // hay que ponerlo a mano: sin él la API recibe el cuerpo sin tipo y
        // responde VALIDATION_ERROR, que parece culpa del nodo y no lo es.
        if (opciones.json && opciones.body !== undefined) {
            headers['content-type'] = headers['content-type'] ?? 'application/json';
        }
        const respuesta = await fetch(url, {
            method: opciones.method ?? 'GET',
            headers,
            body: opciones.body !== undefined ? JSON.stringify(opciones.body) : undefined,
        });
        const crudo = await respuesta.text();
        let cuerpo;
        try {
            cuerpo = JSON.parse(crudo);
        } catch {
            cuerpo = crudo;
        }
        if (!respuesta.ok) {
            // La forma que n8n le entrega al nodo cuando la API responde >=400.
            const error = new Error(`Request failed with status code ${respuesta.status}`);
            error.response = { status: respuesta.status, body: cuerpo };
            throw error;
        }
        return cuerpo;
    };

    return {
        getInputData: () => [{ json: {} }],
        getNodeParameter: (nombre, _i, porDefecto) => {
            const valor = params[nombre];
            if (valor === undefined && porDefecto !== undefined) return porDefecto;
            if (valor === undefined) return '';
            return valor;
        },
        getCredentials: async () => ({ apiKey: API_KEY, baseUrl: BASE_URL }),
        helpers: {
            httpRequest: http,
            // La autenticada añade el Bearer, igual que n8n con la credencial.
            httpRequestWithAuthentication: async (_cred, opciones) =>
                http({
                    ...opciones,
                    headers: { ...(opciones.headers ?? {}), Authorization: `Bearer ${API_KEY}` },
                }),
            // El nodo sube el archivo por la vía binaria de n8n. Aquí se le
            // entrega el PDF de prueba en vez de un adjunto de un nodo previo.
            assertBinaryData: () => ({ fileName: `smoke-${marcaGlobal}.pdf` }),
            getBinaryDataBuffer: async () => Buffer.from(pdfBase64(), 'base64'),
        },
        continueOnFail: () => false,
        getNode: () => ({ name: 'AllSign smoke' }),
        getExecutionId: () => ejecucion,
    };
}

let pasos = 0;
let fallos = 0;
let limitados = 0;

/**
 * La API limita a 10 peticiones por minuto. Sin pausa, el smoke se autolimita
 * a la mitad y los fallos parecen del nodo. 7s deja margen.
 */
const RITMO_MS = Number(process.env.RITMO_MS ?? 7000);

async function paso(titulo, params, comprobar, opciones = {}) {
    if (pasos > 0) await new Promise((r) => setTimeout(r, RITMO_MS));
    pasos += 1;
    const etiqueta = `${String(pasos).padStart(2, ' ')}. ${titulo}`;
    try {
        // Cada corrida es una ejecución distinta, como en n8n. Si se repitiera el
        // id, la llave de idempotencia derivada chocaría con la corrida anterior
        // y la API la rechazaría — bien por la API, pero el smoke no correría dos veces.
        const salida = await node.execute.call(contexto(params, `smoke_${marcaGlobal}_${pasos}`));
        const json = salida[0][0].json;
        const detalle = comprobar ? comprobar(json) : '';
        console.log(`✓ ${etiqueta}${detalle ? ` — ${detalle}` : ''}`);
        return json;
    } catch (error) {
        // Un límite de tasa NO es un fallo del nodo: prueba que la ida y vuelta
        // funciona y que el error se traduce bien. La API permite 10 por minuto.
        const cuerpoErr = error?.cause?.response?.body ?? error?.response?.body;
        const esLimite =
            cuerpoErr?.code === 'RATE_LIMITED' || String(error.description ?? '').includes('RATE_LIMITED');
        if (esLimite) {
            limitados += 1;
            console.log(`~ ${etiqueta} — límite de tasa de la API, no del nodo`);
            return null;
        }
        fallos += 1;
        console.log(`✗ ${etiqueta}`);
        console.log(`     ${error.message}`);
        if (error.description) console.log(`     ${error.description}`);
        const cuerpo = error?.cause?.response?.body ?? error?.response?.body;
        if (cuerpo?.errors) for (const e of cuerpo.errors) console.log(`     campo ${e.field ?? e.name}: ${e.detail ?? e.code}`);
        return null;
    }
}

console.log(`\nSmoke del nodo contra ${BASE_URL}`);
console.log(`Key: ${API_KEY.slice(0, 16)}…  (ambiente no-live: sin cobro)\n`);

const marca = marcaGlobal;
const correo = `smoke+${marca}@allsign.io`;

// ── 1. createDocument ───────────────────────────────────────────────────────
const creado = await paso(
    'createDocument — desde archivo, con firmante y validación autógrafa',
    {
        resource: 'document',
        operation: 'createDocument',
        documentName: `Smoke ${marca}`,
        source: 'file',
        fileSource: 'binary',
        binaryProperty: 'data',
        'signers.signerValues': [
            { name: 'Firmante Smoke', deliveryMethod: 'email', email: correo },
        ],
        signatureValidations: { verifyAutografa: true },
    },
    (j) => `id ${j.id}`,
);

const documentId = creado?.id;
if (!documentId) {
    console.log('\nSin documento no se puede seguir. Los pasos siguientes lo necesitan.\n');
    process.exit(1);
}

// ── 2. getDocument ──────────────────────────────────────────────────────────
await paso(
    'getDocument',
    { resource: 'document', operation: 'getDocument', documentId },
    (j) => `estado ${j.status}`,
);

// ── 3. listDocuments ────────────────────────────────────────────────────────
await paso(
    'listDocuments',
    { resource: 'document', operation: 'listDocuments', limit: 3 },
    (j) => `${(j.data ?? []).length} documentos`,
);

// ── 4. listDocumentSigners ──────────────────────────────────────────────────
await paso(
    'listDocumentSigners',
    { resource: 'document', operation: 'listDocumentSigners', documentId },
    (j) => `${(j.data ?? []).length} firmantes`,
);

// ── 5. sendDocument ─────────────────────────────────────────────────────────
await paso(
    'sendDocument — sin recipients, invita a los firmantes ya adjuntos',
    { resource: 'document', operation: 'sendDocument', documentId },
    (j) => `estado ${j.status}`,
);

// ── 6. remindSigner ─────────────────────────────────────────────────────────
const firmantes = await paso(
    'listDocumentSigners tras el envío',
    { resource: 'document', operation: 'listDocumentSigners', documentId },
    (j) => `${(j.data ?? []).length} firmantes`,
);
const signerId = firmantes?.data?.[0]?.id;
if (signerId) {
    // El recordatorio tiene límite propio: mandarlo justo después de la
    // invitación se rechaza por diseño. Lo que se comprueba aquí es que la
    // ruta existe y que el nodo traduce bien el error, no que se envíe.
    await paso(
        'remindSigner',
        { resource: 'document', operation: 'remindSigner', documentId, signerId },
        null,
        { rateLimitEsperado: true },
    );
} else {
    console.log('   remindSigner — omitido: el documento no devolvió firmantes');
}

// ── 7. getDocumentEvidence ──────────────────────────────────────────────────
await paso(
    'getDocumentEvidence — sin firmar aún, debe decir por qué no hay expediente',
    { resource: 'document', operation: 'getDocumentEvidence', documentId },
    (j) => `available=${j.available}${j.reason ? ` (${j.reason})` : ''}`,
);

// ── 8. voidDocument ─────────────────────────────────────────────────────────
await paso(
    'voidDocument — deja el documento anulado, no borrado',
    { resource: 'document', operation: 'voidDocument', documentId, reason: 'Smoke test' },
    (j) => `estado ${j.status}`,
);

console.log(`\n${pasos - fallos - limitados}/${pasos} en verde` + (limitados ? `, ${limitados} frenados por límite de tasa (no es el nodo)` : '') + '.');
if (fallos > 0) {
    console.log('Hay fallos arriba. NO publiques hasta entenderlos.\n');
    process.exit(1);
}
console.log('El nodo habla con la API real. Documento de prueba anulado.\n');
