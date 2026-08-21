import { createHash, randomUUID } from 'node:crypto';
import type {
	IDataObject,
	IExecuteFunctions,
	IHttpRequestOptions,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
	JsonObject,
} from 'n8n-workflow';
import { NodeConnectionTypes, NodeApiError, NodeOperationError } from 'n8n-workflow';

/**
 * Idempotency-Key determinista para una operación de escritura.
 *
 * Por qué NO `randomUUID()`: n8n reintenta un nodo por su cuenta cuando el POST
 * hace timeout o devuelve 5xx. Con una llave nueva en cada intento, la API ve
 * dos peticiones distintas y crea DOS documentos — y cobra dos veces. El
 * síntoma es el mismo del cliente que canceló: falla en silencio y se ve bien.
 *
 * La llave se deriva de (executionId, itemIndex, operación, documentId) para que:
 *   - el mismo item reintentado reuse su llave  → la API replaya, no duplica;
 *   - dos operaciones del mismo item no colisionen → un `void` no se replaya
 *     como si fuera el `send` anterior devolviendo su respuesta.
 *
 * La forma importa: `app/api/v3/idempotency.py` valida contra
 *   ^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$
 * o sea UUID v4 ESTRICTO — el `4` y el `[89ab]` no son decorativos. Por eso no
 * basta concatenar los campos: se hashean y se fuerzan esos dos nibbles.
 *
 * Si no hay executionId (pruebas manuales, algunos contextos de n8n), se cae a
 * `randomUUID()`: preferimos una llave aleatoria a una constante que provoque
 * replays entre ejecuciones distintas.
 */
function stableIdempotencyKey(
	executionId: string,
	itemIndex: number,
	operation: string,
	documentId = '',
): string {
	if (!executionId) return randomUUID();

	const h = createHash('sha256')
		.update(`${executionId}:${itemIndex}:${operation}:${documentId}`)
		.digest('hex');

	// Nibble 12 fijo en '4' (versión) y nibble 16 en 8|9|a|b (variante RFC 4122).
	const variant = '89ab'[parseInt(h[16], 16) % 4];
	return [
		h.slice(0, 8),
		h.slice(8, 12),
		`4${h.slice(13, 16)}`,
		`${variant}${h.slice(17, 20)}`,
		h.slice(20, 32),
	].join('-');
}

export class Allsign implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'AllSign',
		name: 'allsign',
		icon: 'file:allsign.svg',
		group: ['transform'],
		version: 1,
		subtitle:
			'={{ ({ createDocument: "Create Document", sendDocument: "Send Document", getDocument: "Get Document", listDocuments: "List Documents", listDocumentSigners: "List Signers", getDocumentEvidence: "Get Evidence", voidDocument: "Void Document", remindSigner: "Remind Signer" })[$parameter["operation"]] }}',
		description:
			'Create, send, retrieve, list, void, and remind on documents with the AllSign API v3 — inline signers and signature validation at creation, plus evidence bundles and manual reminders. NOM-151, FEA, biometric verification.',
		defaults: {
			name: 'AllSign',
		},
		inputs: [NodeConnectionTypes.Main],
		outputs: [NodeConnectionTypes.Main],
		usableAsTool: true,
		credentials: [
			{
				name: 'allSignApi',
				required: true,
			},
		],
		codex: {
			alias: [
				'Signature',
				'PDF',
				'Sign',
				'Biometric',
				'NOM-151',
				'FEA',
				'Signer',
				'WhatsApp',
			],
		},
		properties: [
			// ====================================================
			// RESOURCE
			// ====================================================
			{
				displayName: 'Resource',
				name: 'resource',
				type: 'options',
				noDataExpression: true,
				default: 'document',
				options: [
					{
						name: 'Document',
						value: 'document',
					},
				],
			},

			// ====================================================
			// OPERATION
			// ====================================================
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				default: 'createDocument',
				displayOptions: {
					show: {
						resource: ['document'],
					},
				},
				options: [
					{
						name: 'Create Document',
						value: 'createDocument',
						description: 'Create a document from a file or template, with inline signers and signature validation',
						action: 'Create a document',
					},
					{
						name: 'Get Document',
						value: 'getDocument',
						description: 'Retrieve a document by ID',
						action: 'Get a document',
					},
					{
						name: 'Get Evidence',
						value: 'getDocumentEvidence',
						description: 'Get a document evidence bundle (signed PDF and NOM-151 constancia)',
						action: 'Get document evidence',
					},
					{
						name: 'List Documents',
						value: 'listDocuments',
						description: 'List documents, with optional filters',
						action: 'List documents',
					},
					{
						name: 'List Signers',
						value: 'listDocumentSigners',
						description: 'List the signers on a document',
						action: 'List document signers',
					},
					{
						name: 'Remind Signer',
						value: 'remindSigner',
						description: 'Send a manual reminder to a signer who has not completed yet',
						action: 'Remind a signer',
					},
					{
						name: 'Send Document',
						value: 'sendDocument',
						description: 'Send an existing document to its signers, optionally overriding recipients',
						action: 'Send a document',
					},
					{
						name: 'Void Document',
						value: 'voidDocument',
						description: 'Void (annul) a document — not a delete, the record is kept for NOM-151 retention',
						action: 'Void a document',
					},
				],
			},

			// ====================================================
			// DOCUMENT DETAILS (Create Document)
			// ====================================================

			// ------ Document Name ------
			{
				displayName: 'Document Name',
				name: 'documentName',
				type: 'string',
				default: '',
				required: true,
				placeholder: 'e.g. Contract Q1 2026',
				description: 'Name for the new document',
				displayOptions: {
					show: {
						resource: ['document'],
						operation: ['createDocument'],
					},
				},
			},

			// ------ Source ------
			{
				displayName: 'Source',
				name: 'source',
				type: 'options',
				default: 'file',
				description: 'Where the document content comes from — an inline file or an existing AllSign template',
				displayOptions: {
					show: {
						resource: ['document'],
						operation: ['createDocument'],
					},
				},
				options: [
					{
						name: 'File',
						value: 'file',
						description: 'Upload a PDF or DOCX (from URL or binary input)',
					},
					{
						name: 'Template',
						value: 'template',
						description: 'Use an existing AllSign template, filling in its variables',
					},
				],
			},

			// ------ File Source (source = file) ------
			{
				displayName: 'File Source',
				name: 'fileSource',
				type: 'options',
				default: 'binary',
				displayOptions: {
					show: {
						resource: ['document'],
						operation: ['createDocument'],
						source: ['file'],
					},
				},
				options: [
					{
						name: 'Binary Input',
						value: 'binary',
						description: 'Use binary data from a previous node (e.g. Read File, Google Drive, Dropbox)',
					},
					{
						name: 'URL',
						value: 'url',
						description: 'Provide a public URL to the file',
					},
				],
			},
			{
				displayName: 'Binary Property',
				name: 'binaryProperty',
				type: 'string',
				default: 'data',
				description: 'Name of the binary property containing the file',
				displayOptions: {
					show: {
						resource: ['document'],
						operation: ['createDocument'],
						source: ['file'],
						fileSource: ['binary'],
					},
				},
			},
			{
				displayName: 'File URL',
				name: 'fileUrl',
				type: 'string',
				default: '',
				placeholder: 'https://example.com/document.pdf',
				description: 'URL of the file. Supports direct links, Google Drive, and Dropbox — auto-converted to download URLs. For Google Drive, the file must be shared as "Anyone with the link". For private files, use Binary Input with the Google Drive node.',
				displayOptions: {
					show: {
						resource: ['document'],
						operation: ['createDocument'],
						source: ['file'],
						fileSource: ['url'],
					},
				},
			},

			// ------ Template (source = template) ------
			{
				displayName: 'Template ID',
				name: 'templateId',
				type: 'string',
				default: '',
				required: true,
				placeholder: 'tmpl_...',
				description: 'ID of an existing AllSign template',
				displayOptions: {
					show: {
						resource: ['document'],
						operation: ['createDocument'],
						source: ['template'],
					},
				},
			},
			{
				displayName: 'Template Values',
				name: 'templateValues',
				type: 'json',
				default: '{}',
				placeholder: '{"nombre_completo": "Juan Pérez", "monto": "$10,000"}',
				description: 'Key-value pairs to fill in the template variables. Keys are the template\'s natural variable names (never camelCased).',
				displayOptions: {
					show: {
						resource: ['document'],
						operation: ['createDocument'],
						source: ['template'],
					},
				},
			},

			// ====================================================
			// SIGNERS (Create Document)
			// ====================================================
			{
				displayName: 'Signers',
				name: 'signers',
				type: 'fixedCollection',
				typeOptions: {
					multipleValues: true,
				},
				default: {},
				required: true,
				placeholder: 'Add Signer',
				description: 'People who need to sign the document. Each signer receives their invitation via their chosen delivery method — email or WhatsApp.',
				displayOptions: {
					show: {
						resource: ['document'],
						operation: ['createDocument'],
					},
				},
				options: [
					{
						name: 'signerValues',
						displayName: 'Signer',
						values: [
							{
								displayName: 'Delivery Method',
								name: 'deliveryMethod',
								type: 'options',
								default: 'email',
								description: 'How the signing invitation will be delivered to this signer',
								options: [
									{
										name: 'Email',
										value: 'email',
										description: 'Send the signing invitation via email',
									},
									{
										name: 'WhatsApp',
										value: 'whatsapp',
										description: 'Send the signing invitation via WhatsApp',
									},
								],
							},
							{
								displayName: 'Email',
								name: 'email',
								type: 'string',
								placeholder: 'name@email.com',
								default: '',
								required: true,
								description: 'Email address of the signer',
								displayOptions: {
									show: {
										deliveryMethod: ['email'],
									},
								},
							},
							{
								displayName: 'Name',
								name: 'name',
								type: 'string',
								default: '',
								required: true,
								description: 'Full name of the signer',
							},
							{
								displayName: 'Role Name',
								name: 'roleName',
								type: 'string',
								default: '',
								placeholder: 'e.g. proveedor',
								description: 'Semantic role for this signer (e.g. "proveedor"), used to auto-assign template variables marked with that role. Optional.',
							},
							{
								displayName: 'WhatsApp',
								name: 'whatsapp',
								type: 'string',
								default: '',
								placeholder: '+525512345678',
								required: true,
								description: 'WhatsApp number with country code (e.g. +525512345678)',
								displayOptions: {
									show: {
										deliveryMethod: ['whatsapp'],
									},
								},
							},
						],
					},
				],
			},

			// ====================================================
			// 🛡️ SIGNATURE VALIDATIONS (collapsible, Create Document)
			// ====================================================
			{
				displayName: 'Signature Validations',
				name: 'signatureValidations',
				type: 'collection',
				placeholder: 'Add Validation',
				default: {},
				description:
					'Signature types and verification methods for legal validity and security',
				displayOptions: {
					show: {
						resource: ['document'],
						operation: ['createDocument'],
					},
				},
				options: [
					{
						displayName: 'Biometric Selfie',
						name: 'verifyBiometricSelfie',
						type: 'boolean',
						default: false,
						description:
							'Whether to require a biometric selfie for face comparison against the signer\'s ID (anti-deepfake)',
					},
					{
						displayName: 'FEA (Advanced Electronic Signature)',
						name: 'verifyFea',
						type: 'boolean',
						default: false,
						description:
							'Whether to require FEA (Advanced Electronic Signature) verification — Mexico standard',
					},
					{
						displayName: 'Handwritten Signature (Autografa)',
						name: 'verifyAutografa',
						type: 'boolean',
						default: true,
						description:
							'Whether to require a handwritten-style digital signature. Enabled by default.',
					},
					{
						displayName: 'ID Scan',
						name: 'verifyIdScan',
						type: 'boolean',
						default: false,
						description:
							'Whether to require signers to scan their government-issued ID',
					},
					{
						displayName: 'NOM-151 (Timestamping)',
						name: 'verifyNom151',
						type: 'boolean',
						default: false,
						description:
							'Whether to apply NOM-151 certified conservation timestamping to the document',
					},
					{
						displayName: 'Video Signature',
						name: 'verifyVideo',
						type: 'boolean',
						default: false,
						description:
							'Whether to require a recorded video of the signer during the signing process',
					},
				],
			},

			// ====================================================
			// ⚙️ CONFIGURATION (collapsible, Create Document)
			// ====================================================
			{
				displayName: 'Configuration',
				name: 'configuration',
				type: 'collection',
				placeholder: 'Configure',
				default: {},
				description: 'Controls expiration and request idempotency',
				displayOptions: {
					show: {
						resource: ['document'],
						operation: ['createDocument'],
					},
				},
				options: [
					{
						displayName: 'Expires At',
						name: 'expiresAt',
						type: 'dateTime',
						default: '',
						description:
							'Optional expiration deadline (ISO 8601). After this date, the document expires and can no longer be signed.',
					},
					{
						displayName: 'Idempotency Key',
						name: 'idempotencyKey',
						type: 'string',
						default: '',
						placeholder: 'e.g. order-4821-create',
						description:
							'Optional — set your own key to safely retry this request without creating a duplicate document. If left empty, a random UUID v4 is auto-generated per execution (the API requires this header on every write).',
					},
				],
			},

			// ====================================================
			// DOCUMENT (Send / Get / List Signers / Get Evidence / Void / Remind)
			// ====================================================
			{
				displayName: 'Document ID',
				name: 'documentId',
				type: 'string',
				default: '',
				required: true,
				placeholder: 'doc_...',
				description: 'ID of the document (doc_...) — e.g. the ID returned by Create Document',
				displayOptions: {
					show: {
						resource: ['document'],
						operation: [
							'sendDocument',
							'getDocument',
							'listDocumentSigners',
							'getDocumentEvidence',
							'voidDocument',
							'remindSigner',
						],
					},
				},
			},

			// ====================================================
			// RECIPIENTS (Send Document)
			// ====================================================
			{
				displayName: 'Recipients',
				name: 'recipients',
				type: 'fixedCollection',
				typeOptions: {
					multipleValues: true,
				},
				default: {},
				placeholder: 'Add Recipient',
				description: 'Optional — overrides who receives the invitation. Leave empty to send to the signers already attached to the document.',
				displayOptions: {
					show: {
						resource: ['document'],
						operation: ['sendDocument'],
					},
				},
				options: [
					{
						name: 'recipientValues',
						displayName: 'Recipient',
						values: [
							{
								displayName: 'Delivery Method',
								name: 'deliveryMethod',
								type: 'options',
								default: 'email',
								description: 'How the invitation will be delivered to this recipient',
								options: [
									{
										name: 'Email',
										value: 'email',
										description: 'Send the invitation via email',
									},
									{
										name: 'WhatsApp',
										value: 'whatsapp',
										description: 'Send the invitation via WhatsApp',
									},
								],
							},
							{
								displayName: 'Email',
								name: 'email',
								type: 'string',
								placeholder: 'name@email.com',
								default: '',
								required: true,
								description: 'Email address of the recipient',
								displayOptions: {
									show: {
										deliveryMethod: ['email'],
									},
								},
							},
							{
								displayName: 'Name',
								name: 'name',
								type: 'string',
								default: '',
								description: 'Name of the recipient (optional)',
							},
							{
								displayName: 'WhatsApp',
								name: 'whatsapp',
								type: 'string',
								default: '',
								placeholder: '+525512345678',
								required: true,
								description: 'WhatsApp number with country code (e.g. +525512345678)',
								displayOptions: {
									show: {
										deliveryMethod: ['whatsapp'],
									},
								},
							},
						],
					},
				],
			},

			// ====================================================
			// ⚙️ CONFIGURATION (Send Document / Void Document / Remind Signer)
			// ====================================================
			{
				displayName: 'Idempotency Key',
				name: 'idempotencyKey',
				type: 'string',
				default: '',
				placeholder: 'e.g. order-4821-send',
				description: 'Optional — set your own key to safely retry this request without duplicating the effect (a second invitation, void, or reminder). If left empty, a random UUID v4 is auto-generated per execution (the API requires this header on every write).',
				displayOptions: {
					show: {
						resource: ['document'],
						operation: ['sendDocument', 'voidDocument', 'remindSigner'],
					},
				},
			},

			// ====================================================
			// REASON (Void Document)
			// ====================================================
			{
				displayName: 'Reason',
				name: 'reason',
				type: 'string',
				default: '',
				placeholder: 'e.g. Contract superseded by a new draft',
				description: 'Optional — why the document is being voided. Kept in the document audit log.',
				displayOptions: {
					show: {
						resource: ['document'],
						operation: ['voidDocument'],
					},
				},
			},

			// ====================================================
			// SIGNER ID (Remind Signer)
			// ====================================================
			{
				displayName: 'Signer ID',
				name: 'signerId',
				type: 'string',
				default: '',
				required: true,
				placeholder: 'sgr_...',
				description: 'ID of the signer to remind (sgr_...) — get it from List Signers',
				displayOptions: {
					show: {
						resource: ['document'],
						operation: ['remindSigner'],
					},
				},
			},

			// ====================================================
			// LIST DOCUMENTS
			// ====================================================
			{
				displayName: 'Limit',
				name: 'limit',
				type: 'number',
				// eslint-disable-next-line n8n-nodes-base/node-param-default-wrong-for-limit -- the AllSign API defaults `limit` to 20 (not n8n's usual 50); this matches GET /v3/documents server-side.
				default: 20,
				typeOptions: {
					minValue: 1,
					maxValue: 100,
				},
				// eslint-disable-next-line n8n-nodes-base/node-param-description-wrong-for-limit -- documents the real API default/range instead of the generic convention text.
				description: 'Max number of documents to return (1-100, default 20 to match the API)',
				displayOptions: {
					show: {
						resource: ['document'],
						operation: ['listDocuments'],
					},
				},
			},
			{
				displayName: 'Filters',
				name: 'filters',
				type: 'collection',
				placeholder: 'Add Filter',
				default: {},
				description: 'Optional filters and pagination cursors for the list',
				displayOptions: {
					show: {
						resource: ['document'],
						operation: ['listDocuments'],
					},
				},
				options: [
					{
						displayName: 'Ending Before',
						name: 'endingBefore',
						type: 'string',
						default: '',
						description: 'Cursor — return documents ending before this one (mutually exclusive with Starting After)',
					},
					{
						displayName: 'Folder ID',
						name: 'folderId',
						type: 'string',
						default: '',
						placeholder: 'fld_...',
						description: 'Only return documents in this folder',
					},
					{
						displayName: 'Include Total',
						name: 'includeTotal',
						type: 'boolean',
						default: false,
						description: 'Whether to include the total match count (extra query cost)',
					},
					{
						displayName: 'Scope',
						name: 'scope',
						type: 'options',
						default: 'owner',
						description: 'Which documents to include, relative to the caller',
						options: [
							{ name: 'Owner (Default)', value: 'owner', description: 'Only documents owned by the caller' },
							{ name: 'Organization', value: 'org', description: "All documents in the caller's organization" },
							{ name: 'Tenant', value: 'tenant', description: "All documents in the caller's tenant (multi-org admin scope)" },
							{ name: 'Accessible', value: 'accessible', description: 'Documents the caller owns or participates in' },
						],
					},
					{
						displayName: 'Search',
						name: 'search',
						type: 'string',
						default: '',
						description: 'Free-text search',
					},
					{
						displayName: 'Starting After',
						name: 'startingAfter',
						type: 'string',
						default: '',
						description: 'Cursor — return documents starting after this one (mutually exclusive with Ending Before)',
					},
					{
						displayName: 'Status',
						name: 'status',
						type: 'options',
						default: '',
						description: 'Filter by lifecycle status',
						options: [
							{ name: 'Any', value: '' },
							{ name: 'Awaiting Signatures', value: 'awaiting_signatures' },
							{ name: 'Collecting Data', value: 'collecting_data' },
							{ name: 'Completed', value: 'completed' },
							{ name: 'Correcting', value: 'correcting' },
							{ name: 'Draft', value: 'draft' },
							{ name: 'Expired', value: 'expired' },
							{ name: 'Processing', value: 'processing' },
							{ name: 'Voided', value: 'voided' },
						],
					},
				],
			},
		],
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const returnData: INodeExecutionData[] = [];
		const credentials = await this.getCredentials('allSignApi');
		const baseUrl = ((credentials.baseUrl as string) || 'https://api.allsign.io').replace(
			/\/+$/,
			'',
		);

		for (let i = 0; i < items.length; i++) {
			try {
				const operation = this.getNodeParameter('operation', i, 'createDocument') as string;

				if (operation === 'sendDocument') {
					const documentId = (this.getNodeParameter('documentId', i) as string).trim();
					if (!documentId) {
						throw new NodeOperationError(this.getNode(), 'Document ID is required', {
							itemIndex: i,
						});
					}

					const recipientsData = this.getNodeParameter('recipients.recipientValues', i, []) as Array<{
						name?: string;
						deliveryMethod: string;
						email?: string;
						whatsapp?: string;
					}>;

					// Build recipients[] — each recipient uses exactly one delivery method
					const recipients = recipientsData.map((recipient) => {
						const r: Record<string, string> = {};
						const method = recipient.deliveryMethod || 'email';
						const label = recipient.name ? ` "${recipient.name}"` : '';

						if (method === 'email') {
							const email = (recipient.email || '').trim();
							if (!email) {
								throw new NodeOperationError(
									this.getNode(),
									`Recipient${label} has Email as delivery method but no email address was provided`,
									{ itemIndex: i },
								);
							}
							r.email = email;
						} else {
							const whatsapp = (recipient.whatsapp || '').trim();
							if (!whatsapp) {
								throw new NodeOperationError(
									this.getNode(),
									`Recipient${label} has WhatsApp as delivery method but no WhatsApp number was provided`,
									{ itemIndex: i },
								);
							}
							r.phone = whatsapp;
						}

						const name = (recipient.name || '').trim();
						if (name) {
							r.name = name;
						}

						return r;
					});

					// The API requires Idempotency-Key on every write (400

					// La llave por defecto es DETERMINISTA, no aleatoria: n8n reintenta solo
					// cuando el POST hace timeout, y con `randomUUID()` cada intento creaba otro
					// documento y volvía a cobrar. Ver `stableIdempotencyKey`.
					const idempotencyKey =
					(this.getNodeParameter('idempotencyKey', i, '') as string).trim() ||
					stableIdempotencyKey(this.getExecutionId(), i, 'sendDocument', documentId);

					const body: Record<string, unknown> = {};
					if (recipients.length > 0) {
						body.recipients = recipients;
					}

					const requestOptions: IHttpRequestOptions = {
						method: 'POST',
						url: `${baseUrl}/v3/documents/${documentId}/send`,
						body,
						json: true,
						headers: { 'Idempotency-Key': idempotencyKey },
					};

					// ── Single call: send the document to its signers (or overridden recipients) ──
					let sendResponse: IDataObject;
					try {
						sendResponse = (await this.helpers.httpRequestWithAuthentication.call(
							this,
							'allSignApi',
							requestOptions,
						)) as IDataObject;
					} catch (sendError) {
						throw new NodeApiError(this.getNode(), sendError as JsonObject, {
							message: 'Document send failed',
							itemIndex: i,
						});
					}

					returnData.push({ json: sendResponse });
					continue;
				}

				if (operation === 'getDocument') {
					const documentId = (this.getNodeParameter('documentId', i) as string).trim();
					if (!documentId) {
						throw new NodeOperationError(this.getNode(), 'Document ID is required', {
							itemIndex: i,
						});
					}

					// Read-only: no body, no Idempotency-Key (doesn't apply to GET).
					const requestOptions: IHttpRequestOptions = {
						method: 'GET',
						url: `${baseUrl}/v3/documents/${documentId}`,
						json: true,
					};

					let getResponse: IDataObject;
					try {
						getResponse = (await this.helpers.httpRequestWithAuthentication.call(
							this,
							'allSignApi',
							requestOptions,
						)) as IDataObject;
					} catch (getError) {
						throw new NodeApiError(this.getNode(), getError as JsonObject, {
							message: 'Document retrieval failed',
							itemIndex: i,
						});
					}

					returnData.push({ json: getResponse });
					continue;
				}

				if (operation === 'listDocuments') {
					const limit = this.getNodeParameter('limit', i, 20) as number;
					const filters = this.getNodeParameter('filters', i, {}) as IDataObject;

					const qs: IDataObject = { limit };
					const status = (filters.status as string) ?? '';
					if (status) {
						qs.status = status;
					}
					const scope = (filters.scope as string) ?? '';
					if (scope) {
						qs.scope = scope;
					}
					const search = (filters.search as string) ?? '';
					if (search) {
						qs.search = search;
					}
					const startingAfter = (filters.startingAfter as string) ?? '';
					if (startingAfter) {
						qs.startingAfter = startingAfter;
					}
					const endingBefore = (filters.endingBefore as string) ?? '';
					if (endingBefore) {
						qs.endingBefore = endingBefore;
					}
					const folderId = (filters.folderId as string) ?? '';
					if (folderId) {
						qs.folderId = folderId;
					}
					if ((filters.includeTotal as boolean) ?? false) {
						qs.includeTotal = true;
					}

					// Read-only: no body, no Idempotency-Key (doesn't apply to GET).
					const requestOptions: IHttpRequestOptions = {
						method: 'GET',
						url: `${baseUrl}/v3/documents`,
						qs,
						json: true,
					};

					let listResponse: IDataObject;
					try {
						listResponse = (await this.helpers.httpRequestWithAuthentication.call(
							this,
							'allSignApi',
							requestOptions,
						)) as IDataObject;
					} catch (listError) {
						throw new NodeApiError(this.getNode(), listError as JsonObject, {
							message: 'Listing documents failed',
							itemIndex: i,
						});
					}

					returnData.push({ json: listResponse });
					continue;
				}

				if (operation === 'listDocumentSigners') {
					const documentId = (this.getNodeParameter('documentId', i) as string).trim();
					if (!documentId) {
						throw new NodeOperationError(this.getNode(), 'Document ID is required', {
							itemIndex: i,
						});
					}

					// Read-only: no body, no Idempotency-Key (doesn't apply to GET).
					const requestOptions: IHttpRequestOptions = {
						method: 'GET',
						url: `${baseUrl}/v3/documents/${documentId}/signers`,
						json: true,
					};

					let signersResponse: IDataObject;
					try {
						signersResponse = (await this.helpers.httpRequestWithAuthentication.call(
							this,
							'allSignApi',
							requestOptions,
						)) as IDataObject;
					} catch (signersError) {
						throw new NodeApiError(this.getNode(), signersError as JsonObject, {
							message: 'Listing signers failed',
							itemIndex: i,
						});
					}

					returnData.push({ json: signersResponse });
					continue;
				}

				if (operation === 'getDocumentEvidence') {
					const documentId = (this.getNodeParameter('documentId', i) as string).trim();
					if (!documentId) {
						throw new NodeOperationError(this.getNode(), 'Document ID is required', {
							itemIndex: i,
						});
					}

					// Read-only: no body, no Idempotency-Key (doesn't apply to GET).
					const requestOptions: IHttpRequestOptions = {
						method: 'GET',
						url: `${baseUrl}/v3/documents/${documentId}/evidence`,
						json: true,
					};

					let evidenceResponse: IDataObject;
					try {
						evidenceResponse = (await this.helpers.httpRequestWithAuthentication.call(
							this,
							'allSignApi',
							requestOptions,
						)) as IDataObject;
					} catch (evidenceError) {
						throw new NodeApiError(this.getNode(), evidenceError as JsonObject, {
							message: 'Retrieving evidence failed',
							itemIndex: i,
						});
					}

					returnData.push({ json: evidenceResponse });
					continue;
				}

				if (operation === 'voidDocument') {
					const documentId = (this.getNodeParameter('documentId', i) as string).trim();
					if (!documentId) {
						throw new NodeOperationError(this.getNode(), 'Document ID is required', {
							itemIndex: i,
						});
					}

					const reason = (this.getNodeParameter('reason', i, '') as string).trim();
					// The API requires Idempotency-Key on every write (400

					// La llave por defecto es DETERMINISTA, no aleatoria: n8n reintenta solo
					// cuando el POST hace timeout, y con `randomUUID()` cada intento creaba otro
					// documento y volvía a cobrar. Ver `stableIdempotencyKey`.
					const idempotencyKey =
					(this.getNodeParameter('idempotencyKey', i, '') as string).trim() ||
					stableIdempotencyKey(this.getExecutionId(), i, 'voidDocument', documentId);

					const body: Record<string, unknown> = {};
					if (reason) {
						body.reason = reason;
					}

					const requestOptions: IHttpRequestOptions = {
						method: 'POST',
						url: `${baseUrl}/v3/documents/${documentId}/void`,
						body,
						json: true,
						headers: { 'Idempotency-Key': idempotencyKey },
					};

					let voidResponse: IDataObject;
					try {
						voidResponse = (await this.helpers.httpRequestWithAuthentication.call(
							this,
							'allSignApi',
							requestOptions,
						)) as IDataObject;
					} catch (voidError) {
						throw new NodeApiError(this.getNode(), voidError as JsonObject, {
							message: 'Voiding document failed',
							itemIndex: i,
						});
					}

					returnData.push({ json: voidResponse });
					continue;
				}

				if (operation === 'remindSigner') {
					const documentId = (this.getNodeParameter('documentId', i) as string).trim();
					if (!documentId) {
						throw new NodeOperationError(this.getNode(), 'Document ID is required', {
							itemIndex: i,
						});
					}

					const signerId = (this.getNodeParameter('signerId', i) as string).trim();
					if (!signerId) {
						throw new NodeOperationError(this.getNode(), 'Signer ID is required', {
							itemIndex: i,
						});
					}

					// The API requires Idempotency-Key on every write (400

					// La llave por defecto es DETERMINISTA, no aleatoria: n8n reintenta solo
					// cuando el POST hace timeout, y con `randomUUID()` cada intento creaba otro
					// documento y volvía a cobrar. Ver `stableIdempotencyKey`.
					const idempotencyKey =
					(this.getNodeParameter('idempotencyKey', i, '') as string).trim() ||
					stableIdempotencyKey(this.getExecutionId(), i, 'remindSigner', documentId);

					// The router has no body param for this endpoint — none is sent.
					const requestOptions: IHttpRequestOptions = {
						method: 'POST',
						url: `${baseUrl}/v3/documents/${documentId}/signers/${signerId}/remind`,
						json: true,
						headers: { 'Idempotency-Key': idempotencyKey },
					};

					let remindResponse: IDataObject;
					try {
						remindResponse = (await this.helpers.httpRequestWithAuthentication.call(
							this,
							'allSignApi',
							requestOptions,
						)) as IDataObject;
					} catch (remindError) {
						throw new NodeApiError(this.getNode(), remindError as JsonObject, {
							message: 'Reminding signer failed',
							itemIndex: i,
						});
					}

					returnData.push({ json: remindResponse });
					continue;
				}

				const documentName = this.getNodeParameter('documentName', i) as string;
				const source = this.getNodeParameter('source', i, 'file') as string;

				const signersData = this.getNodeParameter('signers.signerValues', i, []) as Array<{
					name: string;
					deliveryMethod: string;
					email?: string;
					whatsapp?: string;
					roleName?: string;
				}>;

				// Configuration (from collapsible collection)
				const configSettings = this.getNodeParameter('configuration', i, {}) as IDataObject;
				const expiresAt = (configSettings.expiresAt as string) ?? '';
				// The API requires Idempotency-Key on every write (400
				// IDEMPOTENCY_KEY_REQUIRED) — auto-generate a UUID v4 per item
				// when the user didn't provide a stable key of their own.
				// Determinista por (ejecución, item): un retry de n8n reusa la llave y la
				// API replaya en vez de crear un segundo documento. Ver `stableIdempotencyKey`.
				const idempotencyKey =
					((configSettings.idempotencyKey as string) ?? '').trim() ||
					stableIdempotencyKey(this.getExecutionId(), i, 'createDocument');

				// Signature Validations (from collapsible collection) — v3's curated 6-flag subset
				const sigValidations = this.getNodeParameter('signatureValidations', i, {}) as IDataObject;
				const signatureValidation: Record<string, boolean> = {
					autografa: (sigValidations.verifyAutografa as boolean) ?? true,
					nom151: (sigValidations.verifyNom151 as boolean) ?? false,
					fea: (sigValidations.verifyFea as boolean) ?? false,
					biometricSignature: (sigValidations.verifyBiometricSelfie as boolean) ?? false,
					idScan: (sigValidations.verifyIdScan as boolean) ?? false,
					videofirma: (sigValidations.verifyVideo as boolean) ?? false,
				};

				// Build signers[] — each signer uses exactly one delivery method
				const signers = signersData.map((signer) => {
					const s: Record<string, string> = { name: signer.name };
					const method = signer.deliveryMethod || 'email';

					if (method === 'email') {
						const email = (signer.email || '').trim();
						if (!email) {
							throw new NodeOperationError(
								this.getNode(),
								`Signer "${signer.name}" has Email as delivery method but no email address was provided`,
								{ itemIndex: i },
							);
						}
						s.email = email;
					} else {
						const whatsapp = (signer.whatsapp || '').trim();
						if (!whatsapp) {
							throw new NodeOperationError(
								this.getNode(),
								`Signer "${signer.name}" has WhatsApp as delivery method but no WhatsApp number was provided`,
								{ itemIndex: i },
							);
						}
						s.phone = whatsapp;
					}

					const roleName = (signer.roleName || '').trim();
					if (roleName) {
						s.roleName = roleName;
					}

					return s;
				});

				// Build the v3 create body — one call, no orchestration
				const body: Record<string, unknown> = {
					source,
					name: documentName,
					signatureValidation,
				};

				if (source === 'template') {
					const templateId = (this.getNodeParameter('templateId', i) as string).trim();
					if (!templateId) {
						throw new NodeOperationError(
							this.getNode(),
							'Template ID is required when Source is Template',
							{ itemIndex: i },
						);
					}
					body.templateId = templateId;

					const templateValuesRaw = this.getNodeParameter('templateValues', i, '{}') as string;
					try {
						const parsed = JSON.parse(templateValuesRaw);
						if (parsed && typeof parsed === 'object' && Object.keys(parsed).length > 0) {
							body.templateValues = parsed;
						}
					} catch (parseError) {
						throw new NodeOperationError(
							this.getNode(),
							`Invalid JSON in Template Values: ${(parseError as Error).message}`,
							{ itemIndex: i },
						);
					}
				} else {
					const fileSource = this.getNodeParameter('fileSource', i) as string;

					let fileBase64: string;
					let fileName: string;

					if (fileSource === 'url') {
						let fileUrl = this.getNodeParameter('fileUrl', i) as string;

						// Auto-convert cloud storage sharing links to direct download URLs
						const gdriveMatch = fileUrl.match(/drive\.google\.com\/file\/d\/([^/]+)/);
						if (gdriveMatch) {
							fileUrl = `https://drive.google.com/uc?export=download&id=${gdriveMatch[1]}`;
						}
						if (fileUrl.includes('dropbox.com') && fileUrl.includes('dl=0')) {
							fileUrl = fileUrl.replace('dl=0', 'dl=1');
						}

						const fileBuffer = Buffer.from(
							await this.helpers.httpRequest({
								method: 'GET',
								url: fileUrl,
								encoding: 'arraybuffer',
							}) as Buffer,
						);
						fileBase64 = Buffer.from(fileBuffer).toString('base64');
						const urlParts = fileUrl.split('/');
						fileName = decodeURIComponent(urlParts[urlParts.length - 1] || 'document.pdf');
					} else {
						const binaryProperty = this.getNodeParameter('binaryProperty', i) as string;
						const binaryData = this.helpers.assertBinaryData(i, binaryProperty);
						const buffer = await this.helpers.getBinaryDataBuffer(i, binaryProperty);
						fileBase64 = Buffer.from(buffer).toString('base64');
						fileName = binaryData.fileName || 'document.pdf';
					}

					// Sanitize fileName: strip accents (é→e, ñ→n) and remove non-ASCII chars
					fileName = fileName.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
					const fileType = fileName.toLowerCase().endsWith('.docx') ? 'docx' : 'pdf';

					body.file = {
						content: fileBase64,
						fileType,
						name: fileName,
					};
				}

				if (signers.length > 0) {
					body.signers = signers;
				}

				if (expiresAt) {
					body.expiresAt = expiresAt;
				}

				const requestOptions: IHttpRequestOptions = {
					method: 'POST',
					url: `${baseUrl}/v3/documents`,
					body,
					json: true,
					headers: { 'Idempotency-Key': idempotencyKey },
				};

				// ── Single call: create the document with signers + validation inline ──
				let createResponse: IDataObject;
				try {
					createResponse = (await this.helpers.httpRequestWithAuthentication.call(
						this,
						'allSignApi',
						requestOptions,
					)) as IDataObject;
				} catch (createError) {
					throw new NodeApiError(this.getNode(), createError as JsonObject, {
						message: 'Document creation failed',
						itemIndex: i,
					});
				}

				returnData.push({ json: createResponse });
			} catch (error) {
				// Re-throw NodeOperationErrors directly (from our inner validation checks)
				if (error instanceof NodeOperationError) {
					if (this.continueOnFail()) {
						returnData.push({ json: { error: (error as Error).message } });
						continue;
					}
					throw error;
				}

				if (this.continueOnFail()) {
					returnData.push({ json: { error: (error as Error).message } });
					continue;
				}

				throw new NodeApiError(this.getNode(), error as JsonObject, {
					itemIndex: i,
				});
			}
		}

		return [returnData];
	}
}
