import { createHmac, randomBytes } from 'node:crypto';
import { AllsignTrigger, verifyStandardWebhook } from './AllsignTrigger.node';

/**
 * Los tests de la firma son el corazón de este nodo.
 *
 * Todo lo demás que hace el trigger es fontanería: dar de alta un endpoint,
 * darlo de baja, llenar un desplegable. Esto es lo único que separa un webhook
 * en el que se puede confiar de una URL pública donde cualquiera que la adivine
 * puede inyectar un "documento firmado" que nunca ocurrió.
 *
 * Se firma como firma la API —mismo algoritmo, misma llave, mismo contenido—
 * en vez de comparar contra una cadena grabada a mano: así estos tests fallan
 * si alguien cambia el esquema, no solo si cambia el resultado.
 */

/** Un secreto con la forma real: `whsec_` + 32 bytes en base64 estándar. */
const SECRET = `whsec_${randomBytes(32).toString('base64')}`;

/** Firma como la API: HMAC-SHA256 sobre `{id}.{timestamp}.{cuerpo}`. */
function sign(id: string, timestamp: number, body: string, secret = SECRET): string {
	const key = Buffer.from(secret.replace(/^whsec_/, ''), 'base64');
	const mac = createHmac('sha256', key).update(`${id}.${timestamp}.${body}`).digest('base64');
	return `v1,${mac}`;
}

const EVENT_ID = 'evt_9f8b7c6d5e4f3a2b1c0d9e8f7a6b5c4d';
const BODY = JSON.stringify({
	eventId: EVENT_ID,
	eventType: 'signer.signed',
	apiVersion: '2026-07-11',
	occurredAt: '2026-09-07T21:52:00.000Z',
	tenantId: '9b89eced-49aa-45c2-b40e-40f3c40083e5',
	livemode: true,
	data: { documentId: 'doc_e43985c1d7c047a28eafb8390562ad4a' },
});

describe('AllSign Trigger', () => {
	describe('Verificación de firma (Standard Webhooks)', () => {
		const now = 1_757_282_000;

		it('acepta una entrega legítima', () => {
			const result = verifyStandardWebhook(
				BODY,
				{ id: EVENT_ID, timestamp: String(now), signature: sign(EVENT_ID, now, BODY) },
				SECRET,
				now,
			);
			expect(result.ok).toBe(true);
		});

		it('rechaza un cuerpo alterado, aunque la firma venga bien formada', () => {
			// El ataque que importa: alguien conoce la URL y manda un
			// "document.completed" que nunca ocurrió.
			const forged = BODY.replace('signer.signed', 'document.completed');
			const result = verifyStandardWebhook(
				forged,
				{ id: EVENT_ID, timestamp: String(now), signature: sign(EVENT_ID, now, BODY) },
				SECRET,
				now,
			);
			expect(result).toEqual({ ok: false, reason: 'no signature matched' });
		});

		it('rechaza una firma hecha con otro secreto', () => {
			const otro = `whsec_${randomBytes(32).toString('base64')}`;
			const result = verifyStandardWebhook(
				BODY,
				{ id: EVENT_ID, timestamp: String(now), signature: sign(EVENT_ID, now, BODY, otro) },
				SECRET,
				now,
			);
			expect(result.ok).toBe(false);
		});

		it('rechaza si el id no es el que se firmó', () => {
			// El id va DENTRO del HMAC justamente para que no se pueda cambiar por
			// separado: sin eso, un atacante reetiquetaría una entrega válida con
			// otro id y se saltaría la deduplicación.
			const result = verifyStandardWebhook(
				BODY,
				{ id: 'evt_otro', timestamp: String(now), signature: sign(EVENT_ID, now, BODY) },
				SECRET,
				now,
			);
			expect(result.ok).toBe(false);
		});

		it('rechaza una entrega vieja aunque la firma cuadre (replay)', () => {
			const viejo = now - 3600;
			const result = verifyStandardWebhook(
				BODY,
				{ id: EVENT_ID, timestamp: String(viejo), signature: sign(EVENT_ID, viejo, BODY) },
				SECRET,
				now,
			);
			expect(result).toEqual({
				ok: false,
				reason: 'webhook-timestamp outside the replay window',
			});
		});

		it('tolera un reloj adelantado dentro de la ventana', () => {
			const adelantado = now + 120;
			const result = verifyStandardWebhook(
				BODY,
				{ id: EVENT_ID, timestamp: String(adelantado), signature: sign(EVENT_ID, adelantado, BODY) },
				SECRET,
				now,
			);
			expect(result.ok).toBe(true);
		});

		it('acepta durante una rotación: dos firmas, una válida', () => {
			// La API firma con el secreto vigente Y con el anterior mientras dura la
			// rotación. Si solo mirásemos la primera, rotar tumbaría el workflow.
			const anterior = `whsec_${randomBytes(32).toString('base64')}`;
			const dos = `${sign(EVENT_ID, now, BODY, anterior)} ${sign(EVENT_ID, now, BODY)}`;
			const result = verifyStandardWebhook(
				BODY,
				{ id: EVENT_ID, timestamp: String(now), signature: dos },
				SECRET,
				now,
			);
			expect(result.ok).toBe(true);
		});

		it('rechaza cuando faltan encabezados', () => {
			const result = verifyStandardWebhook(BODY, { id: EVENT_ID }, SECRET, now);
			expect(result.ok).toBe(false);
		});

		it('rechaza un timestamp que no es número', () => {
			const result = verifyStandardWebhook(
				BODY,
				{ id: EVENT_ID, timestamp: 'ayer', signature: sign(EVENT_ID, now, BODY) },
				SECRET,
				now,
			);
			expect(result).toEqual({ ok: false, reason: 'webhook-timestamp is not a number' });
		});

		it('no firma con material degradado si el secreto no decodifica', () => {
			const result = verifyStandardWebhook(
				BODY,
				{ id: EVENT_ID, timestamp: String(now), signature: 'v1,loquesea' },
				'whsec_corto',
				now,
			);
			expect(result).toEqual({
				ok: false,
				reason: 'the stored secret did not decode to a usable key',
			});
		});

		it('verifica sobre los BYTES crudos, no sobre el JSON reserializado', () => {
			// Este es el error clásico al implementar esto: usar
			// JSON.stringify(req.body) en vez del cuerpo tal como llegó. Reserializar
			// cambia espacios y orden de llaves, y la firma deja de cuadrar aunque el
			// contenido sea el mismo.
			const conEspacios = JSON.stringify(JSON.parse(BODY), null, 2);
			expect(conEspacios).not.toBe(BODY);

			const firmadoCrudo = sign(EVENT_ID, now, conEspacios);
			const headers = { id: EVENT_ID, timestamp: String(now), signature: firmadoCrudo };

			expect(verifyStandardWebhook(conEspacios, headers, SECRET, now).ok).toBe(true);
			expect(verifyStandardWebhook(BODY, headers, SECRET, now).ok).toBe(false);
		});

		it('acepta el cuerpo como Buffer, que es como llega de verdad', () => {
			const result = verifyStandardWebhook(
				Buffer.from(BODY, 'utf8'),
				{ id: EVENT_ID, timestamp: String(now), signature: sign(EVENT_ID, now, BODY) },
				SECRET,
				now,
			);
			expect(result.ok).toBe(true);
		});
	});

	describe('Descripción del nodo', () => {
		const node = new AllsignTrigger();

		it('es un trigger sin entradas y con una salida', () => {
			expect(node.description.group).toEqual(['trigger']);
			expect(node.description.inputs).toEqual([]);
			expect(node.description.outputs).toHaveLength(1);
		});

		it('recibe el evento por POST', () => {
			expect(node.description.webhooks).toEqual([
				expect.objectContaining({ httpMethod: 'POST', name: 'default' }),
			]);
		});

		it('lee el catálogo de eventos de la API en vez de codificarlo', () => {
			// Si alguien sustituye esto por una lista fija, el desplegable queda
			// desactualizado en cuanto la API agregue un evento — y nadie se entera.
			const events = node.description.properties.find((p) => p.name === 'events');
			expect(events?.typeOptions?.loadOptionsMethod).toBe('getEvents');
			expect(events?.options).toBeUndefined();
		});
	});

	describe('Catálogo de eventos', () => {
		const catalogo = {
			data: [
				{ event: 'document.completed', description: 'Todos firmaron.', category: 'Documents', apiVersion: '2026-07-11', status: 'active' },
				{ event: 'signer.signed', description: 'Un firmante firmó.', category: 'Signers', apiVersion: '2026-07-11', status: 'active' },
				{ event: 'signer.declined', description: 'RESERVADO.', category: 'Signers', apiVersion: '2026-07-11', status: 'reserved' },
			],
		};

		const contexto = {
			getCredentials: jest.fn().mockResolvedValue({ baseUrl: 'https://api.allsign.io' }),
			helpers: { httpRequestWithAuthentication: jest.fn().mockResolvedValue(catalogo) },
		};

		it('esconde los eventos reservados: se pueden elegir pero nunca llegan', async () => {
			const node = new AllsignTrigger();
			const opciones = await node.methods.loadOptions.getEvents.call(
				contexto as never,
			);

			const valores = opciones.map((o) => o.value);
			expect(valores).toEqual(['document.completed', 'signer.signed']);
			expect(valores).not.toContain('signer.declined');
		});

		it('pide el catálogo a la ruta del contrato', async () => {
			const node = new AllsignTrigger();
			await node.methods.loadOptions.getEvents.call(contexto as never);

			const [, opciones] = contexto.helpers.httpRequestWithAuthentication.mock.calls[0];
			expect(opciones.url).toBe('https://api.allsign.io/v3/webhooks/events');
			expect(opciones.method).toBe('GET');
		});
	});
});
