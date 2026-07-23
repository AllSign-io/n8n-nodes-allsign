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

export class Allsign implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'AllSign',
		name: 'allsign',
		icon: 'file:allsign.svg',
		group: ['transform'],
		version: 1,
		subtitle: '={{$parameter["operation"] === "sendDocument" ? "Send Document" : "Create Document"}}',
		description:
			'Create and send documents for e-signature with the AllSign API v3 — create with inline signers and signature validation, or send an already-created document to its signers. NOM-151, FEA, biometric verification.',
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
			// OPERATION
			// ====================================================
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				default: 'createDocument',
				options: [
					{
						name: 'Create Document',
						value: 'createDocument',
						description: 'Create a document from a file or template, with inline signers and signature validation',
						action: 'Create a document',
					},
					{
						name: 'Send Document',
						value: 'sendDocument',
						description: 'Send an existing document to its signers, optionally overriding recipients',
						action: 'Send a document',
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
							'Optional key to safely retry this request without creating a duplicate document. Sent as the Idempotency-Key header.',
					},
				],
			},

			// ====================================================
			// DOCUMENT (Send Document)
			// ====================================================
			{
				displayName: 'Document ID',
				name: 'documentId',
				type: 'string',
				default: '',
				required: true,
				placeholder: 'doc_...',
				description: 'ID of the document to send — must already have signers attached (e.g. from Create Document)',
				displayOptions: {
					show: {
						operation: ['sendDocument'],
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
			// ⚙️ CONFIGURATION (Send Document)
			// ====================================================
			{
				displayName: 'Idempotency Key',
				name: 'idempotencyKey',
				type: 'string',
				default: '',
				placeholder: 'e.g. order-4821-send',
				description: 'Optional key to safely retry this request without sending duplicate invitations. Sent as the Idempotency-Key header.',
				displayOptions: {
					show: {
						operation: ['sendDocument'],
					},
				},
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

					const idempotencyKey = (this.getNodeParameter('idempotencyKey', i, '') as string).trim();

					const body: Record<string, unknown> = {};
					if (recipients.length > 0) {
						body.recipients = recipients;
					}

					const requestOptions: IHttpRequestOptions = {
						method: 'POST',
						url: `${baseUrl}/v3/documents/${documentId}/send`,
						body,
						json: true,
					};

					if (idempotencyKey) {
						requestOptions.headers = { 'Idempotency-Key': idempotencyKey };
					}

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
				const idempotencyKey = (configSettings.idempotencyKey as string) ?? '';

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
				};

				if (idempotencyKey.trim()) {
					requestOptions.headers = { 'Idempotency-Key': idempotencyKey.trim() };
				}

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
