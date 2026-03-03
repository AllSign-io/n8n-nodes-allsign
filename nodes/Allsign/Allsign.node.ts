import type {
	IDataObject,
	IExecuteFunctions,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
} from 'n8n-workflow';
import { NodeConnectionTypes, NodeOperationError } from 'n8n-workflow';

export class Allsign implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'AllSign',
		name: 'allsign',
		icon: 'file:allsign.svg',
		group: ['transform'],
		version: 1,
		subtitle: '={{$parameter["operation"]}}',
		description:
			'Create, sign, and manage documents with AllSign e-signature platform. Firma electrónica, NOM-151, FEA, eIDAS.',
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
				'Firma',
				'Documento',
				'Contrato',
				'Signature',
				'PDF',
				'Sign',
				'Biometrica',
				'NOM-151',
				'FEA',
				'eIDAS',
				'Signer',
				'Firmante',
				'WhatsApp',
			],
		},
		properties: [
			// ====================================================
			// OPERATION SELECTOR
			// ====================================================
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				default: 'create',
				options: [
					{
						name: 'Create & Send',
						value: 'create',
						description: 'Create a new document and optionally send it for signing',
						action: 'Create and send a document',
					},
					{
						name: 'Get',
						value: 'get',
						description: 'Retrieve a single document by its ID',
						action: 'Get a document',
					},
					{
						name: 'Get Many',
						value: 'getMany',
						description: 'Retrieve a list of documents',
						action: 'Get many documents',
					},
					{
						name: 'Void',
						value: 'void',
						description: 'Cancel a document and all pending signatures',
						action: 'Void a document',
					},
				],
			},

			// ====================================================
			// DOCUMENT ID (shared by Get, Void)
			// ====================================================
			{
				displayName: 'Document ID',
				name: 'documentId',
				type: 'string',
				default: '',
				required: true,
				placeholder: 'e.g. 550e8400-e29b-41d4-a716-446655440000',
				description: 'The unique ID of the document',
				displayOptions: {
					show: {
						operation: ['get', 'void'],
					},
				},
			},

			// ====================================================
			// VOID — Reason
			// ====================================================
			{
				displayName: 'Reason',
				name: 'voidReason',
				type: 'string',
				default: '',
				placeholder: 'e.g. Contract terms changed',
				description: 'Optional reason for voiding the document',
				displayOptions: {
					show: {
						operation: ['void'],
					},
				},
			},

			// ====================================================
			// GET MANY — Filters
			// ====================================================
			{
				displayName: 'Limit',
				name: 'limit',
				type: 'number',
				default: 20,
				typeOptions: {
					minValue: 1,
					maxValue: 100,
				},
				description: 'Max number of documents to return (1–100)',
				displayOptions: {
					show: {
						operation: ['getMany'],
					},
				},
			},
			{
				displayName: 'Filters',
				name: 'filters',
				type: 'collection',
				placeholder: 'Add Filter',
				default: {},
				description: 'Filter and sort the document list',
				displayOptions: {
					show: {
						operation: ['getMany'],
					},
				},
				options: [
					{
						displayName: 'Created After',
						name: 'createdAfter',
						type: 'dateTime',
						default: '',
						description: 'Filter documents created after this date (ISO 8601)',
					},
					{
						displayName: 'Created Before',
						name: 'createdBefore',
						type: 'dateTime',
						default: '',
						description: 'Filter documents created before this date (ISO 8601)',
					},
					{
						displayName: 'Folder ID',
						name: 'folderId',
						type: 'string',
						default: '',
						description: 'Filter by folder ID',
					},
					{
						displayName: 'Include All History',
						name: 'includeAllHistory',
						type: 'boolean',
						default: false,
						description: 'Whether to include the full document history instead of the default date window',
					},
					{
						displayName: 'Search',
						name: 'search',
						type: 'string',
						default: '',
						placeholder: 'e.g. Contract',
						description: 'Full-text search in document name',
					},
					{
						displayName: 'Signature Status',
						name: 'signatureStatus',
						type: 'options',
						default: '',
						options: [
							{ name: 'All', value: '' },
							{ name: 'Collecting Signers', value: 'RECOLECTANDO_FIRMANTES' },
							{ name: 'Waiting for Signatures', value: 'ESPERANDO_FIRMAS' },
							{ name: 'All Signed', value: 'TODOS_FIRMARON' },
							{ name: 'Expired', value: 'EXPIRADO' },
							{ name: 'Voided', value: 'ANULADO' },
						],
						description: 'Filter by signature status',
					},
					{
						displayName: 'Sort By',
						name: 'sortBy',
						type: 'options',
						default: 'created_at',
						options: [
							{ name: 'Created At', value: 'created_at' },
							{ name: 'Updated At', value: 'updated_at' },
							{ name: 'Name', value: 'name' },
						],
						description: 'Field to sort results by',
					},
					{
						displayName: 'Sort Order',
						name: 'sortOrder',
						type: 'options',
						default: 'desc',
						options: [
							{ name: 'Descending', value: 'desc' },
							{ name: 'Ascending', value: 'asc' },
						],
						description: 'Sort direction',
					},
				],
			},

			// ====================================================
			// CREATE — Document Details
			// ====================================================
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
						operation: ['create'],
					},
				},
			},
			{
				displayName: 'File Source',
				name: 'fileSource',
				type: 'options',
				default: 'binary',
				options: [
					{
						name: 'Binary Input',
						value: 'binary',
						description: 'Use binary data from a previous node (e.g. Read File, Google Drive, Dropbox)',
					},
					{
						name: 'URL',
						value: 'url',
						description: 'Provide a public URL to the PDF file',
					},
				],
				displayOptions: {
					show: {
						operation: ['create'],
					},
				},
			},
			{
				displayName: 'Binary Property',
				name: 'binaryProperty',
				type: 'string',
				default: 'data',
				description: 'Name of the binary property containing the PDF file',
				displayOptions: {
					show: {
						operation: ['create'],
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
				description: 'Public URL of the PDF file to upload',
				displayOptions: {
					show: {
						operation: ['create'],
						fileSource: ['url'],
					},
				},
			},

			// ====================================================
			// CREATE — Signers
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
				description: 'People who need to sign the document. Each signer needs at least an email or a WhatsApp number.',
				displayOptions: {
					show: {
						operation: ['create'],
					},
				},
				options: [
					{
						name: 'signerValues',
						displayName: 'Signer',
						values: [
							{
								displayName: 'Name',
								name: 'name',
								type: 'string',
								default: '',
								required: true,
								description: 'Full name of the signer',
							},
							{
								displayName: 'Email',
								name: 'email',
								type: 'string',
								placeholder: 'name@email.com',
								default: '',
								description: 'Email address of the signer. Optional if a WhatsApp phone number is provided.',
							},
							{
								displayName: 'Country Code',
								name: 'countryCode',
								type: 'options',
								default: '+52',
								description: "Country code for the signer's WhatsApp number",
								options: [
									{ name: '🇦🇷 Argentina (+54)', value: '+54' },
									{ name: '🇧🇷 Brazil (+55)', value: '+55' },
									{ name: '🇨🇱 Chile (+56)', value: '+56' },
									{ name: '🇨🇴 Colombia (+57)', value: '+57' },
									{ name: '🇨🇷 Costa Rica (+506)', value: '+506' },
									{ name: '🇪🇨 Ecuador (+593)', value: '+593' },
									{ name: '🇪🇸 Spain (+34)', value: '+34' },
									{ name: '🇬🇹 Guatemala (+502)', value: '+502' },
									{ name: '🇲🇽 Mexico (+52)', value: '+52' },
									{ name: '🇵🇦 Panama (+507)', value: '+507' },
									{ name: '🇵🇪 Peru (+51)', value: '+51' },
									{ name: '🇺🇸 United States (+1)', value: '+1' },
									{ name: '🔢 Custom', value: 'custom' },
								],
							},
							{
								displayName: 'Custom Country Code',
								name: 'customCountryCode',
								type: 'string',
								default: '',
								placeholder: '+44',
								description: 'Enter the country code manually (e.g. +44 for UK)',
								displayOptions: {
									show: {
										countryCode: ['custom'],
									},
								},
							},
							{
								displayName: 'Phone Number',
								name: 'phoneNumber',
								type: 'string',
								default: '',
								placeholder: '5512345678',
								description:
									'WhatsApp phone number without country code. Required if email is not provided.',
							},
						],
					},
				],
			},

			// ====================================================
			// CREATE — Signature Fields
			// ====================================================
			{
				displayName: 'Signature Fields',
				name: 'signatureFields',
				type: 'fixedCollection',
				typeOptions: {
					multipleValues: true,
				},
				default: {},
				placeholder: 'Add Signature Field',
				description:
					'Define where signatures should be placed on the document. Only assignable to signers with an email address. If empty, signers place fields manually.',
				displayOptions: {
					show: {
						operation: ['create'],
					},
				},
				options: [
					{
						name: 'fieldValues',
						displayName: 'Field',
						values: [
							{
								displayName: 'Placement Mode',
								name: 'placementMode',
								type: 'options',
								default: 'coordinates',
								options: [
									{
										name: 'Anchor Text',
										value: 'anchor',
										description:
											'Place field where a specific text is found in the PDF',
									},
									{
										name: 'Coordinates (X, Y)',
										value: 'coordinates',
										description: 'Place field at specific X, Y coordinates on a page',
									},
								],
							},
							{
								displayName: 'Signer Email',
								name: 'participantEmail',
								type: 'string',
								default: '',
								required: true,
								placeholder: 'name@email.com',
								description:
									'Email of the signer this field belongs to (must match a signer email above). Signature fields can only be pre-assigned to signers with email addresses.',
							},
							{
								displayName: 'Page Number',
								name: 'pageNumber',
								type: 'number',
								default: 1,
								typeOptions: { minValue: 1 },
								description: 'Page where the signature field should be placed (starts at 1). Ignored when All Pages is enabled.',
								displayOptions: { show: { placementMode: ['coordinates'] } },
							},
							{
								displayName: 'X Position',
								name: 'x',
								type: 'number',
								default: 100,
								description: 'Horizontal position in points from left edge of page',
								displayOptions: { show: { placementMode: ['coordinates'] } },
							},
							{
								displayName: 'Y Position',
								name: 'y',
								type: 'number',
								default: 500,
								description: 'Vertical position in points from top edge of page',
								displayOptions: { show: { placementMode: ['coordinates'] } },
							},
							{
								displayName: 'All Pages',
								name: 'includeInAllPages',
								type: 'boolean',
								default: false,
								description: 'Whether to place this field on every page of the document',
								displayOptions: { show: { placementMode: ['coordinates'] } },
							},
							{
								displayName: 'Anchor Text',
								name: 'anchorString',
								type: 'string',
								default: '',
								placeholder: 'e.g. Firma del Cliente',
								description: 'Text to search for in the PDF — the signature field will be placed where this text appears',
								displayOptions: { show: { placementMode: ['anchor'] } },
							},
							{
								displayName: 'Height',
								name: 'height',
								type: 'number',
								default: 100,
								description: 'Height of the signature field in points. Width is auto-calculated (2:1 ratio).',
							},
						],
					},
				],
			},

			// ====================================================
			// CREATE — Notifications (collapsible)
			// ====================================================
			{
				displayName: 'Notifications',
				name: 'notificationSettings',
				type: 'collection',
				placeholder: 'Configure Notifications',
				default: {},
				description:
					'Configure how signers receive their signing links. The channel (email or WhatsApp) is auto-detected based on each signer\'s contact info.',
				displayOptions: {
					show: {
						operation: ['create'],
					},
				},
				options: [
					{
						displayName: 'Send Invitations',
						name: 'sendInvitations',
						type: 'boolean',
						default: true,
						description:
							'Whether to send signing links to each signer after the document is created. The best channel is auto-detected per signer. Disable to share links manually.',
					},
				],
			},

			// ====================================================
			// CREATE — Signature Validations (collapsible)
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
						operation: ['create'],
					},
				},
				options: [
					{
						displayName: 'Autógrafa (Handwritten Signature)',
						name: 'verifyAutografa',
						type: 'boolean',
						default: true,
						description: 'Whether to require a handwritten-style digital signature with biometric capture. Enabled by default.',
					},
					{
						displayName: 'Biometric Selfie',
						name: 'verifyBiometricSelfie',
						type: 'boolean',
						default: false,
						description: 'Whether to require a biometric selfie for face comparison against the signer\'s ID',
					},
					{
						displayName: 'Confirm Name',
						name: 'verifyConfirmName',
						type: 'boolean',
						default: false,
						description: 'Whether to require the signer to type their full name as confirmation',
					},
					{
						displayName: 'eIDAS (European Electronic Signature)',
						name: 'verifyEidas',
						type: 'boolean',
						default: false,
						description: 'Whether to apply eIDAS compliance to the document for European legal validity',
					},
					{
						displayName: 'FEA (Advanced Electronic Signature)',
						name: 'verifyFea',
						type: 'boolean',
						default: false,
						description: 'Whether to require FEA (Firma Electrónica Avanzada) verification',
					},
					{
						displayName: 'ID Scan',
						name: 'verifyIdScan',
						type: 'boolean',
						default: false,
						description: 'Whether to require signers to scan their government-issued ID',
					},
					{
						displayName: 'Identity Verification',
						name: 'verifyIdentity',
						type: 'boolean',
						default: false,
						description: 'Whether to require identity verification for signers',
					},
					{
						displayName: 'NOM-151 (Timestamping)',
						name: 'verifyNom151',
						type: 'boolean',
						default: false,
						description: 'Whether to apply NOM-151 certified timestamping to the document',
					},
					{
						displayName: 'SynthID (AI Detection)',
						name: 'verifySynthId',
						type: 'boolean',
						default: false,
						description: 'Whether to verify the selfie was taken by a real person and not AI-generated (requires Biometric Selfie)',
					},
					{
						displayName: 'Video Signature',
						name: 'verifyVideo',
						type: 'boolean',
						default: false,
						description: 'Whether to require a recorded video of the signer during the signing process',
					},
				],
			},

			// ====================================================
			// CREATE — Additional Options (collapsible)
			// ====================================================
			{
				displayName: 'Additional Options',
				name: 'additionalOptions',
				type: 'collection',
				placeholder: 'Add Option',
				default: {},
				description: 'Additional configuration for the document',
				displayOptions: {
					show: {
						operation: ['create'],
					},
				},
				options: [
					{
						displayName: 'Expires At',
						name: 'expiresAt',
						type: 'dateTime',
						default: '',
						description: 'Optional expiration deadline (ISO 8601). After this date, the document expires and can no longer be signed.',
					},
					{
						displayName: 'Folder Name',
						name: 'folderName',
						type: 'string',
						default: '',
						placeholder: 'e.g. Contracts 2026',
						description: 'Name of the folder where the document will be stored. Leave empty to use the default location.',
					},
					{
						displayName: 'Placeholders (DOCX)',
						name: 'placeholders',
						type: 'json',
						default: '{}',
						placeholder: '{"client_name": "Juan Pérez", "amount": "$10,000"}',
						description: 'Key-value pairs to replace variables in DOCX templates (e.g. {{ client_name }} → "Juan Pérez"). Only applied for .docx files; ignored for PDFs.',
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
		const apiKey = credentials.apiKey as string;
		const authHeaders = { Authorization: `Bearer ${apiKey}` };

		for (let i = 0; i < items.length; i++) {
			try {
				const operation = this.getNodeParameter('operation', i) as string;

				// ==============================================================
				// GET — Retrieve a single document by ID
				// ==============================================================
				if (operation === 'get') {
					const documentId = this.getNodeParameter('documentId', i) as string;

					const response = (await this.helpers.httpRequest({
						method: 'GET',
						headers: authHeaders,
						url: `${baseUrl}/v2/documents/${documentId}`,
						json: true,
					})) as IDataObject;

					returnData.push({ json: response });
				}

				// ==============================================================
				// GET MANY — List documents with filters
				// ==============================================================
				else if (operation === 'getMany') {
					const limit = this.getNodeParameter('limit', i, 20) as number;
					const filters = this.getNodeParameter('filters', i, {}) as IDataObject;

					const qs: Record<string, string | number | boolean> = { limit };

					if (filters.search) qs.search = filters.search as string;
					if (filters.signatureStatus) qs.signatureStatus = filters.signatureStatus as string;
					if (filters.folderId) qs.folderId = filters.folderId as string;
					if (filters.sortBy) qs.sortBy = filters.sortBy as string;
					if (filters.sortOrder) qs.sortOrder = filters.sortOrder as string;
					if (filters.createdAfter) qs.createdAfter = filters.createdAfter as string;
					if (filters.createdBefore) qs.createdBefore = filters.createdBefore as string;
					if (filters.includeAllHistory) qs.includeAllHistory = true;

					const response = (await this.helpers.httpRequest({
						method: 'GET',
						headers: authHeaders,
						url: `${baseUrl}/v2/documents/`,
						qs,
						json: true,
					})) as IDataObject;

					// The API returns { data: [...], pagination: {...} }
					const documents = (response.data as IDataObject[]) || [];
					for (const doc of documents) {
						returnData.push({ json: doc });
					}

					// If no documents, return the raw response so the user sees the pagination info
					if (documents.length === 0) {
						returnData.push({ json: response });
					}
				}

				// ==============================================================
				// VOID — Cancel document and pending signatures
				// ==============================================================
				else if (operation === 'void') {
					const documentId = this.getNodeParameter('documentId', i) as string;
					const reason = this.getNodeParameter('voidReason', i, '') as string;

					const response = (await this.helpers.httpRequest({
						method: 'POST',
						headers: authHeaders,
						url: `${baseUrl}/v2/documents/${documentId}/void`,
						body: { reason },
						json: true,
					})) as IDataObject;

					returnData.push({ json: response });
				}

				// ==============================================================
				// CREATE & SEND — Create document and optionally send invitations
				// ==============================================================
				else {
					const documentName = this.getNodeParameter('documentName', i) as string;
					const fileSource = this.getNodeParameter('fileSource', i) as string;

					const signersData = this.getNodeParameter('signers.signerValues', i, []) as Array<{
						name: string;
						email?: string;
						countryCode?: string;
						customCountryCode?: string;
						phoneNumber?: string;
					}>;

					// Notifications
					const notifSettings = this.getNodeParameter('notificationSettings', i, {}) as IDataObject;
					const sendInvitations = (notifSettings.sendInvitations as boolean) ?? true;

					// Signature Validations
					const sigValidations = this.getNodeParameter('signatureValidations', i, {}) as IDataObject;
					const verifyAutografa = (sigValidations.verifyAutografa as boolean) ?? true;
					const verifyFea = (sigValidations.verifyFea as boolean) ?? false;
					const verifyEidas = (sigValidations.verifyEidas as boolean) ?? false;
					const verifyNom151 = (sigValidations.verifyNom151 as boolean) ?? false;
					const verifyVideo = (sigValidations.verifyVideo as boolean) ?? false;
					const verifyConfirmName = (sigValidations.verifyConfirmName as boolean) ?? false;
					const verifyIdentity = (sigValidations.verifyIdentity as boolean) ?? false;
					const verifyIdScan = (sigValidations.verifyIdScan as boolean) ?? false;
					const verifyBiometricSelfie = (sigValidations.verifyBiometricSelfie as boolean) ?? false;
					const verifySynthId = (sigValidations.verifySynthId as boolean) ?? false;

					// Signature fields
					const fieldsData = this.getNodeParameter('signatureFields.fieldValues', i, []) as Array<{
						participantEmail: string;
						placementMode: string;
						x?: number;
						y?: number;
						pageNumber?: number;
						includeInAllPages?: boolean;
						anchorString?: string;
						height?: number;
					}>;

					// Additional Options
					const additionalOpts = this.getNodeParameter('additionalOptions', i, {}) as IDataObject;
					const folderName = (additionalOpts.folderName as string) ?? '';
					const expiresAt = (additionalOpts.expiresAt as string) ?? '';
					const placeholdersRaw = (additionalOpts.placeholders as string) ?? '{}';

					let placeholders: Record<string, string> | undefined;
					try {
						const parsed = JSON.parse(placeholdersRaw);
						if (parsed && typeof parsed === 'object' && Object.keys(parsed).length > 0) {
							placeholders = parsed;
						}
					} catch {
						// Invalid JSON — ignore silently
					}

					// Get file as base64
					let fileBase64: string;
					let fileName: string;

					if (fileSource === 'url') {
						const fileUrl = this.getNodeParameter('fileUrl', i) as string;
						const fileBuffer = (await this.helpers.httpRequest({
							method: 'GET',
							url: fileUrl,
							encoding: 'arraybuffer',
							returnFullResponse: false,
						})) as Buffer;
						fileBase64 = Buffer.from(fileBuffer).toString('base64');
						const urlParts = fileUrl.split('/');
						fileName = urlParts[urlParts.length - 1] || 'document.pdf';
					} else {
						const binaryProperty = this.getNodeParameter('binaryProperty', i) as string;
						const binaryData = this.helpers.assertBinaryData(i, binaryProperty);
						const buffer = await this.helpers.getBinaryDataBuffer(i, binaryProperty);
						fileBase64 = buffer.toString('base64');
						fileName = binaryData.fileName || 'document.pdf';
					}

					// Build signatureValidation
					const signatureValidation: Record<string, boolean> = {
						autografa: verifyAutografa,
						FEA: verifyFea,
						eidas: verifyEidas,
						nom151: verifyNom151,
						videofirma: verifyVideo,
						biometric_signature: verifyBiometricSelfie,
						confirm_name_to_finish: verifyConfirmName,
						id_scan: verifyIdScan,
					};

					if (verifyIdentity) {
						signatureValidation.ai_verification = verifySynthId || verifyIdScan;
					}

					// Build participants
					const participants = signersData.map((signer) => {
						const participant: Record<string, string> = { name: signer.name };

						if (signer.email && signer.email.trim() !== '') {
							participant.email = signer.email.trim();
						}
						if (signer.phoneNumber && signer.phoneNumber.trim() !== '') {
							const code = signer.countryCode === 'custom'
								? (signer.customCountryCode || '+52')
								: (signer.countryCode || '+52');
							participant.whatsapp = `${code}${signer.phoneNumber.trim()}`;
						}
						if (!participant.email && !participant.whatsapp) {
							throw new NodeOperationError(
								this.getNode(),
								`Signer "${signer.name}" must have at least an email address or a WhatsApp phone number`,
								{ itemIndex: i },
							);
						}
						return participant;
					});

					// Build signature fields
					const fields = fieldsData.map((field) => {
						if (field.placementMode === 'anchor') {
							return {
								participantEmail: field.participantEmail,
								anchorString: field.anchorString || '',
								height: field.height || 100,
							};
						}
						const fieldObj: Record<string, unknown> = {
							participantEmail: field.participantEmail,
							position: { x: field.x ?? 100, y: field.y ?? 500 },
							height: field.height || 100,
						};
						if (field.includeInAllPages) {
							fieldObj.includeInAllPages = true;
						} else {
							fieldObj.pageNumber = field.pageNumber || 1;
						}
						return fieldObj;
					});

					// Build request body
					const hasParticipants = participants.length > 0;
					const startAtStep = hasParticipants ? 2 : 1;

					const configObj: Record<string, unknown> = {
						sendInvitations: false,
						startAtStep,
					};
					if (expiresAt) configObj.expiresAt = expiresAt;

					const body: Record<string, unknown> = {
						document: {
							base64Content: fileBase64,
							name: fileName.endsWith('.pdf') ? fileName : `${documentName}.pdf`,
						},
						participants,
						signatureValidation,
						config: configObj,
					};

					if (fields.length > 0) body.fields = fields;
					if (folderName.trim()) body.folderName = folderName.trim();
					if (placeholders) body.placeholders = placeholders;

					const createResponse = (await this.helpers.httpRequest({
						method: 'POST',
						headers: authHeaders,
						url: `${baseUrl}/v2/documents/`,
						body,
						json: true,
					})) as IDataObject;

					const documentId = createResponse.id as string;

					// Send invitations via invite-bulk
					if (sendInvitations && hasParticipants && documentId) {
						const inviteBody = {
							participants: participants.map((p) => {
								const part: Record<string, string> = {};
								if (p.email) part.email = p.email;
								if (p.whatsapp) part.whatsapp = p.whatsapp;
								if (p.name) part.name = p.name;
								return part;
							}),
							config: {
								sendInvitationByEmail: true,
								sendInvitationByWhatsapp: true,
							},
						};

						try {
							const inviteResponse = (await this.helpers.httpRequest({
								method: 'POST',
								headers: authHeaders,
								url: `${baseUrl}/v2/documents/${documentId}/invite-bulk`,
								body: inviteBody,
								json: true,
							})) as IDataObject;
							createResponse.invitations = inviteResponse;
						} catch (inviteError) {
							const invErr = inviteError as { message?: string };
							createResponse.invitationError =
								invErr.message || 'Failed to send invitations';
						}
					}

					returnData.push({ json: createResponse });
				}
			} catch (error) {
				if (this.continueOnFail()) {
					returnData.push({ json: { error: (error as Error).message } });
					continue;
				}

				const err = error as {
					response?: {
						data?: { message?: string; error?: string; detail?: string | object };
						status?: number;
					};
					message?: string;
				};
				const errorData = err.response?.data || {};
				let apiMessage =
					errorData.message || errorData.error || err.message || 'Unknown error';

				if (errorData.detail) {
					if (typeof errorData.detail === 'string') {
						apiMessage = errorData.detail;
					} else {
						apiMessage = JSON.stringify(errorData.detail);
					}
				}

				throw new NodeOperationError(
					this.getNode(),
					`AllSign API Error: ${apiMessage}`,
					{
						itemIndex: i,
						description: `HTTP Status Code: ${err.response?.status || 'N/A'}`,
					},
				);
			}
		}

		return [returnData];
	}
}
