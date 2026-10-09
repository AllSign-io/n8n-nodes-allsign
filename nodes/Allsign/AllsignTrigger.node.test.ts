import { createHmac, randomBytes } from 'node:crypto';
import { NodeApiError } from 'n8n-workflow';
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

	describe('La entrega que llega (webhook)', () => {
		const now = 1_757_282_000;

		/** Un contexto de n8n con lo mínimo que toca el nodo. */
		function contextoDeEntrega(
			opciones: { body?: string; signature?: string; secret?: string; seenEventIds?: string[] } = {},
		) {
			const body = opciones.body ?? BODY;
			const staticData = {
				webhookId: 'whe_1',
				secret: opciones.secret ?? SECRET,
				seenEventIds: opciones.seenEventIds ?? [],
			};
			const response = {
				status: jest.fn().mockReturnThis(),
				send: jest.fn().mockReturnThis(),
				end: jest.fn().mockReturnThis(),
			};
			return {
				staticData,
				response,
				context: {
					getRequestObject: () => ({ rawBody: Buffer.from(body, 'utf8') }),
					getResponseObject: () => response,
					getHeaderData: () => ({
						'webhook-id': EVENT_ID,
						'webhook-timestamp': String(now),
						'webhook-signature': opciones.signature ?? sign(EVENT_ID, now, body),
					}),
					getWorkflowStaticData: () => staticData,
					getBodyData: () => JSON.parse(body),
					helpers: { returnJsonArray: (d: unknown) => [{ json: d }] },
				},
			};
		}

		beforeAll(() => jest.useFakeTimers().setSystemTime(now * 1000));
		afterAll(() => jest.useRealTimers());

		it('corre el workflow con el evento cuando la firma cuadra', async () => {
			const { context } = contextoDeEntrega();
			const result = await new AllsignTrigger().webhook.call(context as never);

			expect(result.workflowData?.[0]?.[0].json).toEqual(
				expect.objectContaining({ eventType: 'signer.signed', eventId: EVENT_ID }),
			);
		});

		// Regresión: `webhookResponse` es el CUERPO, no el código HTTP. Devolver
		// `{ status: 401 }` ahí responde 200 con ese objeto de cuerpo — AllSign lo
		// daría por entregado, no reintentaría, y el rechazo no aparecería en
		// `/deliveries`. El 401 tiene que escribirse en la respuesta de Express.
		it('responde 401 DE VERDAD cuando la firma no cuadra, y no corre el workflow', async () => {
			const { context, response } = contextoDeEntrega({ signature: 'v1,firmaInventada' });
			const result = await new AllsignTrigger().webhook.call(context as never);

			expect(response.status).toHaveBeenCalledWith(401);
			expect(result).toEqual({ noWebhookResponse: true });
			expect(result.workflowData).toBeUndefined();
		});

		it('tampoco corre el workflow si no hay secreto guardado', async () => {
			const { context, response } = contextoDeEntrega({ secret: '' });
			const result = await new AllsignTrigger().webhook.call(context as never);

			expect(response.status).toHaveBeenCalledWith(401);
			expect(result.workflowData).toBeUndefined();
		});

		it('ignora un reintento del mismo evento sin volver a correr el workflow', async () => {
			// La API reintenta con el MISMO webhook-id. Sin deduplicar, un reintento
			// —porque n8n tardó en contestar— manda el correo dos veces.
			const { context } = contextoDeEntrega({ seenEventIds: [EVENT_ID] });
			const result = await new AllsignTrigger().webhook.call(context as never);

			expect(result).toEqual({});
		});

		it('recuerda el evento para que el siguiente reintento ya sea duplicado', async () => {
			const { context, staticData } = contextoDeEntrega();
			await new AllsignTrigger().webhook.call(context as never);

			expect(staticData.seenEventIds).toContain(EVENT_ID);
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

	/**
	 * El ciclo de vida del endpoint: alta, comprobación y baja.
	 *
	 * Aquí vivían los dos agujeros que encontró la auditoría. `checkExists`
	 * buscaba su id dentro de la LISTA, que devuelve 20, así que en una cuenta
	 * con varios endpoints daba el suyo por muerto y creaba un duplicado. Y
	 * `delete` se tragaba cualquier error y olvidaba el id, dejando endpoints
	 * vivos en AllSign para siempre.
	 */
	describe('Ciclo de vida del endpoint', () => {
		const NODO = {
			name: 'AllSign Trigger',
			type: 'n8n-nodes-allsign.allsignTrigger',
			typeVersion: 1,
			position: [0, 0],
			parameters: {},
		};
		const URL_N8N = 'https://n8n.example.com/webhook/abc';
		const BASE = 'https://api.allsign.io';
		const TODOS_LOS_SCOPES = ['document:*', 'webhook:read', 'webhook:write', 'webhook:delete'];

		/** Un error como el que lanza httpRequestWithAuthentication: el código va como texto. */
		const errorHttp = (status: number) =>
			new NodeApiError(NODO as never, { message: 'falló', response: { status } } as never);

		function contexto(
			staticData: Record<string, unknown>,
			responder: (opciones: { method?: string; url: string }) => unknown,
			parametros: Record<string, unknown> = {},
		) {
			const peticiones: Array<{ method: string; url: string; body?: unknown }> = [];
			return {
				peticiones,
				staticData,
				hook: {
					getNode: () => NODO,
					getNodeWebhookUrl: () => URL_N8N,
					getWorkflowStaticData: () => staticData,
					getNodeParameter: (nombre: string, porDefecto?: unknown) =>
						nombre in parametros ? parametros[nombre] : porDefecto,
					getCredentials: jest.fn().mockResolvedValue({ baseUrl: BASE }),
					helpers: {
						httpRequestWithAuthentication: jest.fn(async (_cred: string, opciones: never) => {
							const o = opciones as { method?: string; url: string; body?: unknown };
							peticiones.push({ method: o.method ?? 'GET', url: o.url, body: o.body });
							return responder(o);
						}),
					},
				},
			};
		}

		const hooks = () => new AllsignTrigger().webhookMethods.default;

		describe('checkExists', () => {
			it('pregunta por SU id, no por la lista: una cuenta con 20+ endpoints ya no duplica', async () => {
				const c = contexto({ webhookId: 'whe_1', secret: 'whsec_x' }, () => ({
					data: { id: 'whe_1', url: URL_N8N, status: 'enabled' },
				}));

				await expect(hooks().checkExists.call(c.hook as never)).resolves.toBe(true);
				expect(c.peticiones).toHaveLength(1);
				expect(c.peticiones[0]).toMatchObject({ method: 'GET', url: `${BASE}/v3/webhooks/whe_1` });
			});

			it('con 404 olvida todo y deja que n8n lo vuelva a crear', async () => {
				const c = contexto({ webhookId: 'whe_1', secret: 'whsec_x', seenEventIds: ['evt_1'] }, () => {
					throw errorHttp(404);
				});

				await expect(hooks().checkExists.call(c.hook as never)).resolves.toBe(false);
				expect(c.staticData).toEqual({});
			});

			it('con 500 falla la activación en vez de crear un duplicado', async () => {
				const c = contexto({ webhookId: 'whe_1', secret: 'whsec_x' }, () => {
					throw errorHttp(500);
				});

				await expect(hooks().checkExists.call(c.hook as never)).rejects.toThrow();
				expect(c.staticData.webhookId).toBe('whe_1');
			});

			it('una caída de red tampoco cuenta como endpoint muerto', async () => {
				const c = contexto({ webhookId: 'whe_1', secret: 'whsec_x' }, () => {
					throw new Error('ECONNREFUSED');
				});

				await expect(hooks().checkExists.call(c.hook as never)).rejects.toThrow();
				expect(c.staticData.webhookId).toBe('whe_1');
			});

			it('si apunta a otra URL lo olvida SIN borrarlo: puede ser de otro workflow', async () => {
				const c = contexto({ webhookId: 'whe_1', secret: 'whsec_x' }, () => ({
					data: { id: 'whe_1', url: 'https://otro-n8n.example.com/webhook/zzz', status: 'enabled' },
				}));

				await expect(hooks().checkExists.call(c.hook as never)).resolves.toBe(false);
				expect(c.staticData).toEqual({});
				expect(c.peticiones.map((p) => p.method)).toEqual(['GET']);
			});

			it('si el circuit breaker lo apagó, lo reactiva y conserva id y secreto', async () => {
				const c = contexto({ webhookId: 'whe_1', secret: 'whsec_x' }, (o) =>
					o.method === 'PATCH' ? {} : { data: { id: 'whe_1', url: URL_N8N, status: 'disabled' } },
				);

				await expect(hooks().checkExists.call(c.hook as never)).resolves.toBe(true);
				expect(c.peticiones[1]).toMatchObject({
					method: 'PATCH',
					url: `${BASE}/v3/webhooks/whe_1`,
					body: { disabled: false },
				});
				expect(c.staticData).toEqual({ webhookId: 'whe_1', secret: 'whsec_x' });
			});

			it('sin nada guardado ni pregunta', async () => {
				const c = contexto({}, () => ({}));
				await expect(hooks().checkExists.call(c.hook as never)).resolves.toBe(false);
				expect(c.peticiones).toHaveLength(0);
			});
		});

		describe('create', () => {
			const crear = (scopes: string[]) =>
				contexto(
					{},
					(o) =>
						o.url.endsWith('/v3/users/me')
							? { scopes }
							: { id: 'whe_nuevo', secret: 'whsec_nuevo' },
					{ events: ['document.completed'], endpointDescription: '' },
				);

			it('con una llave sin webhook:delete falla al ACTIVAR, que es cuando el usuario sí lo ve', async () => {
				const c = crear(['document:*', 'webhook:read', 'webhook:write']);

				await expect(hooks().create.call(c.hook as never)).rejects.toThrow(/webhook:delete/);
				expect(c.peticiones.map((p) => p.url)).toEqual([`${BASE}/v3/users/me`]);
			});

			it('el mensaje nombra TODOS los permisos que faltan', async () => {
				const c = crear(['document:*']);
				await expect(hooks().create.call(c.hook as never)).rejects.toThrow(
					/webhook:read, webhook:write, webhook:delete/,
				);
			});

			it.each([
				['los tres explícitos', TODOS_LOS_SCOPES],
				['el comodín webhook:*', ['document:*', 'webhook:*']],
				['el comodín de todo', ['*']],
			])('con %s crea y guarda el secreto', async (_caso, scopes) => {
				const c = crear(scopes);

				await expect(hooks().create.call(c.hook as never)).resolves.toBe(true);
				expect(c.staticData).toEqual({
					webhookId: 'whe_nuevo',
					secret: 'whsec_nuevo',
					seenEventIds: [],
				});
			});
		});

		describe('delete', () => {
			it('con 204 olvida todo', async () => {
				const c = contexto({ webhookId: 'whe_1', secret: 'whsec_x', seenEventIds: ['evt_1'] }, () => ({}));

				await expect(hooks().delete.call(c.hook as never)).resolves.toBe(true);
				expect(c.peticiones[0]).toMatchObject({ method: 'DELETE', url: `${BASE}/v3/webhooks/whe_1` });
				expect(c.staticData).toEqual({});
			});

			it('con 404 tampoco truena: ya no existe', async () => {
				const c = contexto({ webhookId: 'whe_1', secret: 'whsec_x' }, () => {
					throw errorHttp(404);
				});

				await expect(hooks().delete.call(c.hook as never)).resolves.toBe(true);
				expect(c.staticData).toEqual({});
			});

			it('con 403 lanza y CONSERVA el id, para no dejar el endpoint huérfano', async () => {
				const c = contexto({ webhookId: 'whe_1', secret: 'whsec_x' }, () => {
					throw errorHttp(403);
				});

				await expect(hooks().delete.call(c.hook as never)).rejects.toThrow();
				expect(c.staticData).toEqual({ webhookId: 'whe_1', secret: 'whsec_x' });
			});

			it('una caída de red también conserva el id', async () => {
				const c = contexto({ webhookId: 'whe_1', secret: 'whsec_x' }, () => {
					throw new Error('ETIMEDOUT');
				});

				await expect(hooks().delete.call(c.hook as never)).rejects.toThrow();
				expect(c.staticData.webhookId).toBe('whe_1');
			});
		});
	});
});
