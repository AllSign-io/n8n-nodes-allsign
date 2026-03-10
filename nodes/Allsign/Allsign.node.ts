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
		subtitle: 'Create & Send Document',
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
			// DOCUMENT DETAILS
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
			},

			// ------ File Source ------
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
			},
			{
				displayName: 'Binary Property',
				name: 'binaryProperty',
				type: 'string',
				default: 'data',
				description: 'Name of the binary property containing the PDF file',
				displayOptions: {
					show: {
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
						fileSource: ['url'],
					},
				},
			},


			// ====================================================
			// SIGNERS
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
				description: 'People who need to sign the document. Each signer needs at least an email or a WhatsApp number. When both are provided, the signer verifies their identity via OTP on both channels during signing.',
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
								description: 'Email address of the signer. Optional if WhatsApp is provided. When both are given, the signer verifies via OTP on both channels.',
							},
                                                        {
                                                                displayName: 'WhatsApp',
                                                                name: 'whatsapp',
                                                                type: 'string',
                                                                default: '',
                                                                placeholder: '+525512345678',
                                                                description:
                                                                        'WhatsApp number with country code (e.g. +525512345678). Optional if email is provided. When both are given, dual-channel OTP verification is enabled.',
                                                        },
						],
					},
				],
			},

			// ====================================================
			// SIGNATURE FIELDS
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
					'Pre-posiciona campos de firma en el documento. Solo disponible para firmantes con email. Firmantes con solo WhatsApp colocan su firma manualmente al abrir el link.',
				options: [
					{
						name: 'fieldValues',
						displayName: 'Field',
						values: [
							{
						displayName: 'All Pages',
						name: 'includeInAllPages',
						type: 'boolean',
						default: false,
						description: 'Whether to place this field on every page of the document',
							},
							{
						displayName: 'Anchor Text',
						name: 'anchorString',
						type: 'string',
						default: '',
						placeholder: 'e.g. Firma del Cliente',
						description: 'Text to search for in the PDF	—	the signature field will be placed where this text appears',
							},
							{
						displayName: 'Height',
						name: 'height',
						type: 'number',
						default: 100,
						description: 'Height of the signature field in points. Width is auto-calculated (2:1 ratio).',
							},
							{
						displayName: 'Page Number',
						name: 'pageNumber',
						type: 'number',
						default: 1,
						description: 'Page where the signature field should be placed (starts at 1). Ignored when All Pages is enabled.',
							},
							{
						displayName: 'Placement Mode',
						name: 'placementMode',
						type: 'options',
						default: 'coordinates',
						options: [
									{
										name: 'Anchor Text',
										value: 'anchor',
										description: 'Place field where a specific text is found in the PDF',
									},
									{
										name: 'Coordinates (X, Y)',
										value: 'coordinates',
										description: 'Place field at specific X, Y coordinates on a page',
									},
								]
							},
							{
						displayName: 'Signer Email',
						name: 'participantEmail',
						type: 'string',
						default: '',
							required:	true,
						placeholder: 'name@email.com',
						description: 'Email del firmante al que pertenece este campo (debe coincidir con el email de un firmante de arriba)',
							},
							{
						displayName: 'X Position',
						name: 'x',
						type: 'number',
						default: 100,
						description: 'Horizontal position in points from left edge of page',
							},
							{
						displayName: 'Y Position',
						name: 'y',
						type: 'number',
						default: 500,
						description: 'Vertical position in points from top edge of page',
							},
					],
					},
				],
			},

			// ====================================================
			// 🛡️ SIGNATURE VALIDATIONS (collapsible)
			// ====================================================
			{
				displayName: 'Signature Validations',
				name: 'signatureValidations',
				type: 'collection',
				placeholder: 'Add Validation',
				default: {},
				description:
					'Signature types and verification methods for legal validity and security',
				options: [
					{
						displayName: 'Autógrafa (Handwritten Signature)',
						name: 'verifyAutografa',
						type: 'boolean',
						default: true,
						description:
							'Whether to require a handwritten-style digital signature with biometric capture. Enabled by default.',
					},
					{
						displayName: 'Biometric Selfie',
						name: 'verifyBiometricSelfie',
						type: 'boolean',
						default: false,
						description:
							'Whether to require a biometric selfie for face comparison against the signer\'s ID',
					},
					{
						displayName: 'Confirm Name',
						name: 'verifyConfirmName',
						type: 'boolean',
						default: false,
						description:
							'Whether to require the signer to type their full name as confirmation',
					},
					{
						displayName: 'eIDAS (European Electronic Signature)',
						name: 'verifyEidas',
						type: 'boolean',
						default: false,
						description:
							'Whether to apply eIDAS compliance to the document for European legal validity',
					},
					{
						displayName: 'FEA (Advanced Electronic Signature)',
						name: 'verifyFea',
						type: 'boolean',
						default: false,
						description:
							'Whether to require FEA (Firma Electrónica Avanzada) verification',
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
						displayName: 'Identity Verification',
						name: 'verifyIdentity',
						type: 'boolean',
						default: false,
						description:
							'Whether to require identity verification for signers',
					},
					{
						displayName: 'NOM-151 (Timestamping)',
						name: 'verifyNom151',
						type: 'boolean',
						default: false,
						description:
							'Whether to apply NOM-151 certified timestamping to the document',
					},
					{
						displayName: 'SynthID (AI Detection)',
						name: 'verifySynthId',
						type: 'boolean',
						default: false,
						description:
							'Whether to verify the selfie was taken by a real person and not AI-generated (requires Biometric Selfie)',
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
			// ⚙️ CONFIGURATION (collapsible)
			// ====================================================
			{
				displayName: 'Configuration',
				name: 'configuration',
				type: 'collection',
				placeholder: 'Configure',
				default: {},
				description:
					'Controls the invitation flow, expiration, and template variables',
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
						displayName: 'Send Invitations',
						name: 'sendInvitations',
						type: 'boolean',
						default: true,
						description:
							'Whether to send signing links to each signer after the document is created. The best channel (email or WhatsApp) is auto-detected per signer. When both are provided, OTP is sent on both channels for dual verification. Disable to share links manually.',
					},
					{
						displayName: 'Template Variables (DOCX)',
						name: 'templateVariables',
						type: 'json',
						default: '{}',
						placeholder: '{"client_name": "Juan Pérez", "amount": "$10,000"}',
						description:
							'Key-value pairs to replace variables in DOCX templates (e.g. {{ client_name }} → "Juan Pérez"). Only applied for .docx files; ignored for PDFs.',
					},
				],
			},

			// ====================================================
			// 🔐 PERMISSIONS (collapsible)
			// ====================================================
			{
				displayName: 'Permissions (Optional)',
				name: 'permissions',
				type: 'collection',
				placeholder: 'Configure Permissions',
				default: {},
				description:
					'Define the document owner and collaborators with granular access control',
				options: [
					{
						displayName: 'Collaborators',
						name: 'collaborators',
						type: 'json',
						default: '[]',
						placeholder: '[{"email": "cfo@company.com", "permissions": ["read", "sign"]}]',
						description:
							'List of collaborators with specific permissions. Each has an email and a permissions array. Valid permissions: read, update, delete, sign, admin. A collaborator cannot also be a signer.',
					},
					{
						displayName: 'Owner Email',
						name: 'ownerEmail',
						type: 'string',
						default: '',
						placeholder: 'e.g. legal@company.com',
						description:
							'Email of the document owner. If omitted, the owner will be the user associated with the API key.',
					},
					{
						displayName: 'Public Read',
						name: 'isPublicRead',
						type: 'boolean',
						default: false,
						description:
							'Whether the document is publicly readable without authentication',
					},
				],
			},

			// ====================================================
			// 📁 FOLDER (collapsible)
			// ====================================================
			{
				displayName: 'Folder (Optional)',
				name: 'folderSettings',
				type: 'collection',
				placeholder: 'Configure Folder',
				default: {},
				description:
					'Organize the document into a folder. Use either Folder ID or Folder Name — they are mutually exclusive.',
				options: [
					{
						displayName: 'Folder ID',
						name: 'folderId',
						type: 'string',
						default: '',
						placeholder: 'e.g. 550e8400-e29b-41d4-a716-446655440000',
						description: 'UUID of an existing folder',
					},
					{
						displayName: 'Folder Name',
						name: 'folderName',
						type: 'string',
						default: '',
						placeholder: 'e.g. Contracts 2026',
						description: 'Name of the folder. If it doesn\'t exist, it will be created automatically.',
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
				const documentName = this.getNodeParameter('documentName', i) as string;
				const fileSource = this.getNodeParameter('fileSource', i) as string;

				const signersData = this.getNodeParameter('signers.signerValues', i, []) as Array<{
					name: string;
					email?: string;
					whatsapp?: string;
				}>;

				// Configuration (from collapsible collection)
				const configSettings = this.getNodeParameter('configuration', i, {}) as IDataObject;
				const sendInvitations = (configSettings.sendInvitations as boolean) ?? true;
				const expiresAt = (configSettings.expiresAt as string) ?? '';
				const templateVarsRaw = (configSettings.templateVariables as string) ?? '{}';

				// Signature Validations (from collapsible collection)
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
				const fieldsData = this.getNodeParameter(
					'signatureFields.fieldValues',
					i,
					[],
				) as Array<{
					participantEmail: string;
					placementMode: string;
					x?: number;
					y?: number;
					pageNumber?: number;
					includeInAllPages?: boolean;
					anchorString?: string;
					height?: number;
				}>;

				// Folder (from collapsible collection)
				const folderOpts = this.getNodeParameter('folderSettings', i, {}) as IDataObject;
				const folderId = (folderOpts.folderId as string) ?? '';
				const folderName = (folderOpts.folderName as string) ?? '';

				// Parse template variables JSON
				let templateVariables: Record<string, string> | undefined;
				try {
					const parsed = JSON.parse(templateVarsRaw);
					if (parsed && typeof parsed === 'object' && Object.keys(parsed).length > 0) {
						templateVariables = parsed;
					}
				} catch {
					// Invalid JSON — ignore silently
				}

				// Permissions (from collapsible collection)
				const permSettings = this.getNodeParameter('permissions', i, {}) as IDataObject;
				const ownerEmail = (permSettings.ownerEmail as string) ?? '';
				const collaboratorsRaw = (permSettings.collaborators as string) ?? '[]';
				const isPublicRead = (permSettings.isPublicRead as boolean) ?? false;

				let collaborators: Array<{ email: string; permissions: string[] }> | undefined;
				try {
					const parsed = JSON.parse(collaboratorsRaw);
					if (Array.isArray(parsed) && parsed.length > 0) {
						collaborators = parsed;
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

				// Build signatureValidation — corrected field mappings
				const signatureValidation: Record<string, boolean> = {
					autografa: verifyAutografa,
					FEA: verifyFea,
					eIDAS: verifyEidas,
					nom151: verifyNom151,
					videofirma: verifyVideo,
					biometric_signature: verifyBiometricSelfie,
					confirm_name_to_finish: verifyConfirmName,
					id_scan: verifyIdScan,
				};

				if (verifyIdentity) {
					signatureValidation.ai_verification = verifySynthId || verifyIdScan;
				}

				// Build participants (email is optional — at least email or WhatsApp required)
				const participants = signersData.map((signer) => {
					const participant: Record<string, string> = {
						name: signer.name,
					};

					if (signer.email && signer.email.trim() !== '') {
						participant.email = signer.email.trim();
					}

					if (signer.whatsapp && signer.whatsapp.trim() !== '') {
						participant.whatsapp = signer.whatsapp.trim();
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
						position: {
							x: field.x ?? 100,
							y: field.y ?? 500,
						},
						height: field.height || 100,
					};
					if (field.includeInAllPages) {
						fieldObj.includeInAllPages = true;
					} else {
						fieldObj.pageNumber = field.pageNumber || 1;
					}
					return fieldObj;
				});

				// Note: User-configured fields and auto-generated fields are both
				// added AFTER document creation via /signature-fields endpoint,
				// because the create body cannot contain fields without participants.

				// Build request body — document only, NO participants in create
				// Participants are added via /add-signer endpoint after creation
				// to avoid the Temporal workflow 500 error in doc_setup_participants.
				const hasParticipants = participants.length > 0;

				const configObj: Record<string, unknown> = {
					sendInvitations: false,
					startAtStep: 1,
				};

				if (expiresAt) {
					configObj.expiresAt = expiresAt;
				}

				const body: Record<string, unknown> = {
					document: {
						base64Content: fileBase64,
						name: fileName.endsWith('.pdf') ? fileName : `${documentName}.pdf`,
					},
					signatureValidation,
					config: configObj,
				};

				// Fields are NEVER included in the create body — they are added
				// via /signature-fields endpoint after signers are registered.

				if (folderId.trim()) {
					body.folderId = folderId.trim();
				} else if (folderName.trim()) {
					body.folderName = folderName.trim();
				}

				if (templateVariables) {
					body.placeholders = templateVariables;
				}

				// Build permissions object
				const permObj: Record<string, unknown> = {};
				if (ownerEmail.trim()) permObj.ownerEmail = ownerEmail.trim();
				if (collaborators) permObj.collaborators = collaborators;
				if (isPublicRead) permObj.isPublicRead = true;
				if (Object.keys(permObj).length > 0) {
					body.permissions = permObj;
				}

				// ── Step 1: Create the document (no participants) ──────────────
				let createResponse: IDataObject;
				try {
					createResponse = (await this.helpers.httpRequest({
						method: 'POST',
						headers: authHeaders,
						url: `${baseUrl}/v2/documents/`,
						body,
						json: true,
					})) as IDataObject;
				} catch (createError) {
					const cErr = createError as Record<string, unknown>;
					const message = (cErr.message as string) || 'Unknown error';
					let responseInfo = '';
					try {
						const resp = cErr.response as Record<string, unknown> | undefined;
						if (resp) {
							const respBody = resp.body || resp.data;
							responseInfo = typeof respBody === 'string' ? respBody : JSON.stringify(respBody || '');
						}
					} catch { /* ignore */ }
					throw new NodeOperationError(this.getNode(), `Document creation failed: ${message}${responseInfo ? ` — ${responseInfo}` : ''}`);
				}

				const docId = createResponse.id as string;

				// ── Step 2: Add signers via /add-signer endpoint ──────────────
				if (hasParticipants) {
					// Resolve inviter email (needed for add-signer and invite-bulk)
					let inviterEmail = ownerEmail.trim();
					if (!inviterEmail) {
						try {
							const securityInfo = (await this.helpers.httpRequest({
								method: 'GET',
								headers: authHeaders,
								url: `${baseUrl}/v2/test/security`,
								json: true,
							})) as IDataObject;
							inviterEmail = (securityInfo.authenticatedUser as string) || '';
						} catch {
							// Fallback: leave empty
						}
					}

					for (const p of participants) {
						const signerBody: Record<string, string> = {
							invitedByEmail: inviterEmail,
						};
						if ((p as Record<string, string>).email) {
							signerBody.signerEmail = (p as Record<string, string>).email;
						}
						if ((p as Record<string, string>).whatsapp) {
							signerBody.signerPhone = (p as Record<string, string>).whatsapp;
						}

						try {
							await this.helpers.httpRequest({
								method: 'POST',
								headers: authHeaders,
								url: `${baseUrl}/v2/documents/${docId}/add-signer`,
								body: signerBody,
								json: true,
							});
						} catch {
							// Signer may already exist — continue
						}
					}

					// ── Step 3: Add signature fields ─────────────────────────
					// Add user-configured fields via /signature-fields endpoint
					// (converting from create-body format to endpoint format)
					if (fieldsData.length > 0) {
						for (const f of fields) {
							const fAny = f as Record<string, unknown>;
							const pos = fAny.position as Record<string, number> | undefined;
							const fieldBody: Record<string, unknown> = {
								signerEmail: fAny.participantEmail,
								x: pos ? pos.x : 100,
								y: pos ? pos.y : 500,
								pageNumber: (fAny.pageNumber as number) || 1,
								height: (fAny.height as number) || 100,
								width: 200,
							};
							if (fAny.anchorString) {
								fieldBody.anchorString = fAny.anchorString;
							}
							if (fAny.includeInAllPages) {
								fieldBody.includeInAllPages = true;
							}
							try {
								await this.helpers.httpRequest({
									method: 'POST',
									headers: authHeaders,
									url: `${baseUrl}/v2/documents/${docId}/signature-fields`,
									body: fieldBody,
									json: true,
								});
							} catch {
								// Field creation failed — continue
							}
						}
					} else {
						// Auto-generate a default field for EVERY signer
						for (let idx = 0; idx < signersData.length; idx++) {
							const signer = signersData[idx];
							const fieldBody: Record<string, unknown> = {
								x: 100,
								y: 500 + (idx * 80),
								pageNumber: 1,
								height: 60,
								width: 200,
							};
							if (signer.email && signer.email.trim()) {
								fieldBody.signerEmail = signer.email.trim();
							} else if (signer.whatsapp && signer.whatsapp.trim()) {
								fieldBody.signerPhone = signer.whatsapp.trim();
							}
							try {
								await this.helpers.httpRequest({
									method: 'POST',
									headers: authHeaders,
									url: `${baseUrl}/v2/documents/${docId}/signature-fields`,
									body: fieldBody,
									json: true,
								});
							} catch {
								// Field creation failed — continue
							}
						}
					}

					// ── Step 4: Send invitations via invite-bulk ─────────────
					if (sendInvitations) {
						// invite-bulk enforces single-channel per participant:
						// email OR whatsapp, not both. Email takes priority.
						const inviteParticipants = participants.map((p: Record<string, string>) => {
							const invP: Record<string, string> = { name: p.name };
							if (p.email) {
								invP.email = p.email;
							} else if (p.whatsapp) {
								invP.whatsapp = p.whatsapp;
							}
							return invP;
						});

						try {
							const inviteResponse = (await this.helpers.httpRequest({
								method: 'POST',
								headers: authHeaders,
								url: `${baseUrl}/v2/documents/${docId}/invite-bulk`,
								body: {
									participants: inviteParticipants,
									config: {
										invitedByEmail: inviterEmail,
									},
								},
								json: true,
							})) as IDataObject;

							createResponse.invitations = inviteResponse;
						} catch (inviteError) {
							const invErr = inviteError as {
								message?: string;
								response?: { data?: unknown; status?: number };
							};
							const detail = invErr.response?.data
								? JSON.stringify(invErr.response.data)
								: invErr.message || 'Failed to send invitations';
							createResponse.invitationError = detail;
						}
					}
				}

				returnData.push({ json: createResponse });
			} catch (error) {
				// Re-throw NodeOperationErrors directly (from our inner catch blocks)
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

				const err = error as {
					response?: {
						data?: { message?: string; error?: string; detail?: string | object };
						status?: number;
					};
					message?: string;
					context?: { itemIndex?: number };
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
