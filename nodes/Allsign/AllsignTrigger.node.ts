import { createHmac, timingSafeEqual } from 'node:crypto';
import type {
	IDataObject,
	IHookFunctions,
	ILoadOptionsFunctions,
	INodePropertyOptions,
	INodeType,
	INodeTypeDescription,
	IWebhookFunctions,
	IWebhookResponseData,
} from 'n8n-workflow';
import { NodeConnectionTypes, NodeOperationError } from 'n8n-workflow';

/**
 * Ventana de replay, en segundos, contra `webhook-timestamp`.
 *
 * Es el valor por defecto de Standard Webhooks. No es parte de la firma: un
 * atacante que capture una entrega válida puede reenviarla tal cual y el HMAC
 * seguirá cuadrando — lo único que lo acota es rechazar los timestamps viejos.
 * Se admite margen en AMBAS direcciones porque el reloj del receptor puede ir
 * adelantado respecto al de la API.
 */
const REPLAY_WINDOW_SECONDS = 300;

/** Longitud mínima de la llave, en bytes, tras decodificar el secreto. */
const MIN_KEY_BYTES = 24;

/**
 * Verificación de firma Standard Webhooks (la que emite AllSign v3).
 *
 * El estándar abierto que usan OpenAI, Twilio, Supabase y Svix; AllSign lo
 * adoptó en la v3 justamente para que quien recibe pueda verificar con las
 * librerías oficiales en vez de con un verificador a la medida. Aquí se
 * implementa a mano —y no con una dependencia— porque son 15 líneas y meterle
 * un paquete a un community node es pedirle a n8n que lo audite.
 *
 * Contenido firmado: `{webhook-id}.{webhook-timestamp}.{cuerpo crudo}`.
 *
 * Los tres campos van dentro del HMAC para que ninguno se pueda alterar por
 * separado del cuerpo. **Tiene que ser el cuerpo CRUDO** —`req.rawBody`— y no
 * `JSON.stringify(req.body)`: reserializar cambia espacios y orden de llaves, y
 * la firma deja de cuadrar aunque el contenido sea idéntico.
 *
 * La llave NO son los bytes UTF-8 del secreto: se le quita el prefijo `whsec_`
 * y el resto se decodifica de base64 **alfabeto estándar** (no urlsafe — la API
 * emite con el estándar a propósito, es lo que decodifican las librerías
 * oficiales).
 *
 * El encabezado puede traer VARIAS firmas separadas por espacio (`v1,<a>
 * v1,<b>`): durante una rotación de secreto la API firma con el vigente y con
 * el anterior. Basta que una cuadre.
 */
export function verifyStandardWebhook(
	rawBody: Buffer | string,
	headers: { id?: string; timestamp?: string; signature?: string },
	secret: string,
	nowSeconds = Math.floor(Date.now() / 1000),
): { ok: true } | { ok: false; reason: string } {
	const { id, timestamp, signature } = headers;
	if (!id || !timestamp || !signature) {
		return { ok: false, reason: 'missing webhook-id, webhook-timestamp or webhook-signature header' };
	}

	const sentAt = Number(timestamp);
	if (!Number.isFinite(sentAt)) {
		return { ok: false, reason: 'webhook-timestamp is not a number' };
	}
	if (Math.abs(nowSeconds - sentAt) > REPLAY_WINDOW_SECONDS) {
		return { ok: false, reason: 'webhook-timestamp outside the replay window' };
	}

	const key = Buffer.from(secret.replace(/^whsec_/, ''), 'base64');
	if (key.length < MIN_KEY_BYTES) {
		return { ok: false, reason: 'the stored secret did not decode to a usable key' };
	}

	const body = Buffer.isBuffer(rawBody) ? rawBody : Buffer.from(rawBody, 'utf8');
	const expected = createHmac('sha256', key)
		.update(Buffer.concat([Buffer.from(`${id}.${timestamp}.`, 'utf8'), body]))
		.digest();

	// Un token por firma candidata; cualquiera que cuadre gana.
	const matched = signature
		.split(' ')
		.filter((token) => token.startsWith('v1,'))
		.some((token) => equalsConstantTime(expected, token.slice(3)));

	return matched ? { ok: true } : { ok: false, reason: 'no signature matched' };
}

/**
 * Comparación en tiempo constante contra una firma en base64.
 *
 * `timingSafeEqual` truena si los buffers miden distinto, así que la diferencia
 * de longitud se atiende ANTES — y esa sí se puede responder de inmediato: la
 * longitud no es secreta, el contenido sí.
 */
function equalsConstantTime(expected: Buffer, candidateBase64: string): boolean {
	let candidate: Buffer;
	try {
		candidate = Buffer.from(candidateBase64, 'base64');
	} catch {
		return false;
	}
	if (candidate.length !== expected.length) return false;
	return timingSafeEqual(expected, candidate);
}

/** Lo que el trigger guarda entre `create` y `delete` (y entre ejecuciones). */
interface WebhookStaticData {
	webhookId?: string;
	secret?: string;
	/** Últimos `webhook-id` vistos, para no correr el workflow dos veces con el mismo evento. */
	seenEventIds?: string[];
}

/** Cuántos ids se recuerdan para deduplicar. */
const SEEN_EVENT_IDS_KEPT = 200;

// `usableAsTool` se OMITE a propósito, no se olvidó. Un trigger arranca el
// workflow cuando llega un evento; un agente no lo puede invocar como
// herramienta. Y el tipo de n8n solo admite `true` —`false` ni siquiera
// compila—, así que ausente es la única forma de decir "no aplica".
// eslint-disable-next-line @n8n/community-nodes/node-usable-as-tool
export class AllsignTrigger implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'AllSign Trigger',
		name: 'allsignTrigger',
		icon: 'file:allsign.svg',
		group: ['trigger'],
		version: 1,
		subtitle: '={{$parameter["events"].join(", ")}}',
		description:
			'Starts the workflow when something happens in AllSign — a document is signed, completed, voided, expires, or a NOM-151 constancia is issued',
		defaults: {
			name: 'AllSign Trigger',
		},
		inputs: [],
		outputs: [NodeConnectionTypes.Main],
		credentials: [
			{
				name: 'allSignApi',
				required: true,
			},
		],
		webhooks: [
			{
				name: 'default',
				httpMethod: 'POST',
				responseMode: 'onReceived',
				path: 'webhook',
			},
		],
		codex: {
			alias: ['Signature', 'Sign', 'Webhook', 'Document', 'NOM-151', 'Signer'],
		},
		properties: [
			{
				displayName: 'Event Names or IDs',
				name: 'events',
				type: 'multiOptions',
				required: true,
				default: [],
				// El catálogo se LEE de la API (`GET /v3/webhooks/events`), no se
				// codifica aquí: si se hardcodea, queda desactualizado en cuanto
				// agreguen un evento y nadie se entera hasta que un cliente pregunta.
				typeOptions: {
					loadOptionsMethod: 'getEvents',
				},
				description: 'The AllSign events that start this workflow. Loaded live from your account, so the list is never out of date. Choose from the list, or specify IDs using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
			},
			{
				displayName: 'Description',
				name: 'endpointDescription',
				type: 'string',
				default: '',
				placeholder: 'e.g. n8n — NDA automation',
				description:
					'Optional label for this endpoint, shown in the AllSign dashboard next to the URL. Helps tell several n8n workflows apart.',
			},
		],
	};

	methods = {
		loadOptions: {
			async getEvents(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
				const credentials = await this.getCredentials('allSignApi');
				const baseUrl = ((credentials.baseUrl as string) || 'https://api.allsign.io').replace(
					/\/+$/,
					'',
				);

				const response = (await this.helpers.httpRequestWithAuthentication.call(
					this,
					'allSignApi',
					{ method: 'GET', url: `${baseUrl}/v3/webhooks/events`, json: true },
				)) as { data?: Array<IDataObject> };

				// Solo los `active`. La API ACEPTA suscribirse a los `reserved`
				// (`signer.declined` hoy), pero esos no disparan todavía: ofrecer un
				// evento que se elige y nunca llega es peor que no ofrecerlo, porque
				// no hay ningún error que lo delate.
				return (response.data ?? [])
					.filter((entry) => entry.status === 'active')
					.map((entry) => ({
						name: `${entry.event as string} — ${entry.description as string}`,
						value: entry.event as string,
						description: `${entry.category as string} · ${entry.apiVersion as string}`,
					}));
			},
		},
	};

	webhookMethods = {
		default: {
			/**
			 * ¿Sigue vivo el endpoint que registramos?
			 *
			 * n8n llama esto antes de `create`. Se compara contra la LISTA de la API
			 * y no solo contra lo que tenemos guardado: si alguien borró el endpoint
			 * desde el dashboard, lo que tenemos guardado miente y hay que volver a
			 * crearlo.
			 */
			async checkExists(this: IHookFunctions): Promise<boolean> {
				const staticData = this.getWorkflowStaticData('node') as WebhookStaticData;
				if (!staticData.webhookId) return false;

				const baseUrl = await resolveBaseUrl(this);
				const webhookUrl = this.getNodeWebhookUrl('default');

				const response = (await this.helpers.httpRequestWithAuthentication.call(
					this,
					'allSignApi',
					{ method: 'GET', url: `${baseUrl}/v3/webhooks`, json: true },
				)) as { data?: Array<IDataObject> };

				const live = (response.data ?? []).find((endpoint) => endpoint.id === staticData.webhookId);
				if (!live || live.url !== webhookUrl) {
					// Quedó huérfano o apunta a otra URL: que `create` lo rehaga.
					delete staticData.webhookId;
					delete staticData.secret;
					return false;
				}
				return true;
			},

			/** Da de alta el endpoint y guarda el secreto — la API lo entrega UNA sola vez. */
			async create(this: IHookFunctions): Promise<boolean> {
				const webhookUrl = this.getNodeWebhookUrl('default');
				const events = this.getNodeParameter('events') as string[];
				const endpointDescription = this.getNodeParameter('endpointDescription', '') as string;

				if (!events.length) {
					throw new NodeOperationError(
						this.getNode(),
						'Pick at least one event for the trigger to listen to',
					);
				}
				// La API solo acepta https://. La URL local de n8n es http://, así que
				// sin túnel esto fallaría con un 422 que no dice por qué — mejor
				// decirlo aquí, donde se puede explicar la salida.
				if (!webhookUrl?.startsWith('https://')) {
					throw new NodeOperationError(
						this.getNode(),
						`AllSign only accepts https:// webhook URLs, and this n8n instance is serving ${webhookUrl}`,
						{
							description:
								'Start n8n with a public HTTPS address (for local testing: `n8n start --tunnel`), then activate the workflow again.',
						},
					);
				}

				const baseUrl = await resolveBaseUrl(this);
				const body: IDataObject = { url: webhookUrl, events };
				if (endpointDescription) body.description = endpointDescription;

				const created = (await this.helpers.httpRequestWithAuthentication.call(
					this,
					'allSignApi',
					{ method: 'POST', url: `${baseUrl}/v3/webhooks`, body, json: true },
				)) as IDataObject;

				const staticData = this.getWorkflowStaticData('node') as WebhookStaticData;
				staticData.webhookId = created.id as string;
				// El secreto viene en claro SOLO en esta respuesta. Si no se guarda
				// aquí, no hay forma de volver a pedirlo (habría que rotarlo) y el
				// trigger se queda sin poder verificar nada.
				staticData.secret = created.secret as string;
				staticData.seenEventIds = [];

				return true;
			},

			/** Da de baja el endpoint al desactivar el workflow. */
			async delete(this: IHookFunctions): Promise<boolean> {
				const staticData = this.getWorkflowStaticData('node') as WebhookStaticData;
				if (!staticData.webhookId) return true;

				const baseUrl = await resolveBaseUrl(this);
				try {
					await this.helpers.httpRequestWithAuthentication.call(this, 'allSignApi', {
						method: 'DELETE',
						url: `${baseUrl}/v3/webhooks/${encodeURIComponent(staticData.webhookId)}`,
						json: true,
					});
				} catch {
					// Ya no existe (borrado desde el dashboard, o tenant distinto):
					// desactivar el workflow no debe fallar por eso.
					return true;
				} finally {
					delete staticData.webhookId;
					delete staticData.secret;
					delete staticData.seenEventIds;
				}
				return true;
			},
		},
	};

	async webhook(this: IWebhookFunctions): Promise<IWebhookResponseData> {
		const request = this.getRequestObject();
		const headers = this.getHeaderData() as Record<string, string | undefined>;
		const staticData = this.getWorkflowStaticData('node') as WebhookStaticData;

		if (!staticData.secret) {
			// Sin secreto no se puede verificar nada, y correr el workflow con un
			// cuerpo sin verificar es justo lo que este nodo existe para evitar.
			return refuse('this endpoint has no stored signing secret; re-activate the workflow');
		}

		const verdict = verifyStandardWebhook(
			request.rawBody,
			{
				id: headers['webhook-id'],
				timestamp: headers['webhook-timestamp'],
				signature: headers['webhook-signature'],
			},
			staticData.secret,
		);
		if (!verdict.ok) {
			// 401 sin detalle: quien manda una firma inválida no merece pistas sobre
			// POR QUÉ no cuadró. El motivo queda del lado de AllSign, en el historial
			// de entregas del endpoint (`GET /v3/webhooks/{id}/deliveries`).
			return refuse(verdict.reason);
		}

		// `webhook-id` es ESTABLE entre reintentos: la API reintenta con el mismo id
		// y un timestamp nuevo. Sin deduplicar, un reintento —porque n8n tardó en
		// contestar, no porque el evento se repitiera— corre el workflow dos veces.
		const eventId = headers['webhook-id'] as string;
		const seen = staticData.seenEventIds ?? [];
		if (seen.includes(eventId)) {
			return { webhookResponse: { status: 'duplicate ignored' }, workflowData: [] };
		}
		staticData.seenEventIds = [...seen, eventId].slice(-SEEN_EVENT_IDS_KEPT);

		return {
			workflowData: [this.helpers.returnJsonArray(this.getBodyData() as IDataObject)],
		};
	}
}

/** Rechaza la entrega con 401 y sin correr el workflow. */
function refuse(reason: string): IWebhookResponseData {
	return {
		webhookResponse: { status: 401, body: { error: 'invalid signature' }, reason },
		noWebhookResponse: false,
		workflowData: [],
	};
}

/** La base de la API que trae la credencial, sin diagonal final. */
async function resolveBaseUrl(context: IHookFunctions): Promise<string> {
	const credentials = await context.getCredentials('allSignApi');
	return ((credentials.baseUrl as string) || 'https://api.allsign.io').replace(/\/+$/, '');
}
