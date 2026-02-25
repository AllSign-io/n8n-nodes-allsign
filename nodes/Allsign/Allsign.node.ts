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
		subtitle: '={{$parameter["operation"] + ": " + $parameter["resource"]}}',
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
			],
		},
		properties: [
			// ------ Resource ------
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
						description: 'Create, send, and manage documents for signing',
					},
				],
			},
			// ------ Operation ------
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				displayOptions: {
					show: {
						resource: ['document'],
					},
				},
				default: 'createAndSend',
				options: [
					{
						name: 'Create & Send',
						value: 'createAndSend',
						description: 'Upload a document and send it for signing in one step',
						action: 'Create and send a document',
					},
				],
			},

			// ====================================================
			// CREATE & SEND fields
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
						operation: ['createAndSend'],
					},
				},
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
						description: 'Use binary data from a previous node',
					},
					{
						name: 'URL',
						value: 'url',
						description: 'Provide a public URL to the PDF file',
					},
				],
				displayOptions: {
					show: {
						resource: ['document'],
						operation: ['createAndSend'],
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
						resource: ['document'],
						operation: ['createAndSend'],
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
						resource: ['document'],
						operation: ['createAndSend'],
						fileSource: ['url'],
					},
				},
			},



			// ====== SIGNERS ======
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
				description: 'People who need to sign the document',
				displayOptions: {
					show: {
						resource: ['document'],
						operation: ['createAndSend'],
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
								required: true,
								description: 'Email address of the signer',
							},
							{
								displayName: 'WhatsApp',
								name: 'whatsapp',
								type: 'string',
								default: '',
								placeholder: '+525512345678',
								description: 'WhatsApp number with country code (e.g. +525512345678). Required if Send by WhatsApp is enabled.',
							},
						],
					},
				],
			},

			// ====== SIGNATURE FIELDS ======
			{
				displayName: 'Signature Fields',
				name: 'signatureFields',
				type: 'fixedCollection',
				typeOptions: {
					multipleValues: true,
				},
				default: {},
				placeholder: 'Add Signature Field',
				description: 'Define where signatures should be placed on the document. If empty, signers will need to place fields manually.',
				displayOptions: {
					show: {
						resource: ['document'],
						operation: ['createAndSend'],
					},
				},
				options: [
					{
						name: 'fieldValues',
						displayName: 'Field',
						values: [
							{
								displayName: 'Signer Email',
								name: 'participantEmail',
								type: 'string',
								default: '',
								required: true,
								placeholder: 'name@email.com',
								description: 'Email of the signer this field belongs to (must match a signer email above)',
							},
							{
								displayName: 'Placement Mode',
								name: 'placementMode',
								type: 'options',
								default: 'coordinates',
								options: [
									{
										name: 'Coordinates (X, Y)',
										value: 'coordinates',
										description: 'Place field at specific X, Y coordinates on a page',
									},
									{
										name: 'Anchor Text',
										value: 'anchor',
										description: 'Place field where a specific text is found in the PDF',
									},
								],
							},
							{
								displayName: 'X Position',
								name: 'x',
								type: 'number',
								default: 100,
								description: 'Horizontal position in points from left edge of page',
								displayOptions: {
									show: {
										placementMode: ['coordinates'],
									},
								},
							},
							{
								displayName: 'Y Position',
								name: 'y',
								type: 'number',
								default: 500,
								description: 'Vertical position in points from top edge of page',
								displayOptions: {
									show: {
										placementMode: ['coordinates'],
									},
								},
							},
							{
								displayName: 'Page Number',
								name: 'pageNumber',
								type: 'number',
								default: 1,
								typeOptions: {
									minValue: 1,
								},
								description: 'Page where the signature field should be placed (starts at 1)',
								displayOptions: {
									show: {
										placementMode: ['coordinates'],
									},
								},
							},
							{
								displayName: 'All Pages',
								name: 'includeInAllPages',
								type: 'boolean',
								default: false,
								description: 'Whether to place this field on every page of the document',
								displayOptions: {
									show: {
										placementMode: ['coordinates'],
									},
								},
							},
							{
								displayName: 'Anchor Text',
								name: 'anchorString',
								type: 'string',
								default: '',
								placeholder: 'e.g. Firma del Cliente',
								description: 'Text to search for in the PDF — the signature field will be placed where this text appears',
								displayOptions: {
									show: {
										placementMode: ['anchor'],
									},
								},
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

			// ====== DELIVERY OPTIONS ======
			{
				displayName: 'Send Invitations',
				name: 'sendInvitations',
				type: 'boolean',
				default: true,
				description: 'Whether to send signing invitations to participants after creating the document',
				displayOptions: {
					show: {
						resource: ['document'],
						operation: ['createAndSend'],
					},
				},
			},
			{
				displayName: 'Send by Email',
				name: 'sendByEmail',
				type: 'boolean',
				default: true,
				description: 'Whether to send the invitation via email',
				displayOptions: {
					show: {
						resource: ['document'],
						operation: ['createAndSend'],
						sendInvitations: [true],
					},
				},
			},
			{
				displayName: 'Send by WhatsApp',
				name: 'sendByWhatsapp',
				type: 'boolean',
				default: false,
				description: 'Whether to send the invitation via WhatsApp. Requires WhatsApp number on each signer.',
				displayOptions: {
					show: {
						resource: ['document'],
						operation: ['createAndSend'],
						sendInvitations: [true],
					},
				},
			},

			// ====== SIGNATURE OPTIONS ======
			{
				displayName: 'Autógrafa (Handwritten Signature)',
				name: 'verifyAutografa',
				type: 'boolean',
				default: false,
				description: 'Whether to require a handwritten-style digital signature with biometric capture',
				displayOptions: {
					show: {
						resource: ['document'],
						operation: ['createAndSend'],
					},
				},
			},

			// ====== VERIFICATION OPTIONS ======
			{
				displayName: 'FEA (Advanced Electronic Signature)',
				name: 'verifyFea',
				type: 'boolean',
				default: false,
				description: 'Whether to require FEA (Firma Electrónica Avanzada) verification',
				displayOptions: {
					show: {
						resource: ['document'],
						operation: ['createAndSend'],
					},
				},
			},
			{
				displayName: 'NOM-151 (Timestamping)',
				name: 'verifyNom151',
				type: 'boolean',
				default: false,
				description: 'Whether to apply NOM-151 certified timestamping to the document',
				displayOptions: {
					show: {
						resource: ['document'],
						operation: ['createAndSend'],
					},
				},
			},
			{
				displayName: 'Video Signature',
				name: 'verifyVideo',
				type: 'boolean',
				default: false,
				description: 'Whether to require a recorded video as part of the signing process',
				displayOptions: {
					show: {
						resource: ['document'],
						operation: ['createAndSend'],
					},
				},
			},
			{
				displayName: 'Confirm Name',
				name: 'verifyConfirmName',
				type: 'boolean',
				default: false,
				description: 'Whether to require the signer to type their full name as confirmation',
				displayOptions: {
					show: {
						resource: ['document'],
						operation: ['createAndSend'],
					},
				},
			},

			// ====== IDENTITY VERIFICATION (parent toggle) ======
			{
				displayName: 'Identity Verification',
				name: 'verifyIdentity',
				type: 'boolean',
				default: false,
				description: 'Whether to require identity verification for signers',
				displayOptions: {
					show: {
						resource: ['document'],
						operation: ['createAndSend'],
					},
				},
			},

			// ------ ID Scan (child of Identity Verification) ------
			{
				displayName: 'ID Scan',
				name: 'verifyIdScan',
				type: 'boolean',
				default: false,
				description: 'Whether to require signers to scan their government-issued ID',
				displayOptions: {
					show: {
						resource: ['document'],
						operation: ['createAndSend'],
						verifyIdentity: [true],
					},
				},
			},

			// ------ Biometric Selfie (child of Identity Verification) ------
			{
				displayName: 'Biometric Selfie',
				name: 'verifyBiometricSelfie',
				type: 'boolean',
				default: false,
				description: 'Whether to require a biometric selfie for identity matching',
				displayOptions: {
					show: {
						resource: ['document'],
						operation: ['createAndSend'],
						verifyIdentity: [true],
					},
				},
			},

			// ------ SynthID (child of Biometric Selfie) ------
			{
				displayName: 'SynthID (AI Detection)',
				name: 'verifySynthId',
				type: 'boolean',
				default: false,
				description: 'Whether to verify the selfie was taken by a real person and not AI-generated',
				displayOptions: {
					show: {
						resource: ['document'],
						operation: ['createAndSend'],
						verifyIdentity: [true],
						verifyBiometricSelfie: [true],
					},
				},
			},
		],
	};



	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const returnData: INodeExecutionData[] = [];
		const resource = this.getNodeParameter('resource', 0) as string;
		const operation = this.getNodeParameter('operation', 0) as string;
		const credentials = await this.getCredentials('allSignApi');
		const baseUrl = ((credentials.baseUrl as string) || 'https://api.allsign.io').replace(/\/+$/, '');
		const apiKey = credentials.apiKey as string;
		const authHeaders = { Authorization: `Bearer ${apiKey}` };

		for (let i = 0; i < items.length; i++) {
			try {
				if (resource === 'document') {
					// ============ CREATE & SEND ============
					if (operation === 'createAndSend') {
						const documentName = this.getNodeParameter('documentName', i) as string;
						const fileSource = this.getNodeParameter('fileSource', i) as string;

						const signersData = this.getNodeParameter('signers.signerValues', i, []) as Array<{
							name: string;
							email: string;
							whatsapp?: string;
						}>;
						const verifyAutografa = this.getNodeParameter('verifyAutografa', i, false) as boolean;
						const verifyFea = this.getNodeParameter('verifyFea', i, false) as boolean;
						const verifyNom151 = this.getNodeParameter('verifyNom151', i, false) as boolean;
						const verifyVideo = this.getNodeParameter('verifyVideo', i, false) as boolean;
						const verifyConfirmName = this.getNodeParameter('verifyConfirmName', i, false) as boolean;
						const verifyIdentity = this.getNodeParameter('verifyIdentity', i, false) as boolean;

						// Delivery options
						const sendInvitations = this.getNodeParameter('sendInvitations', i, true) as boolean;
						const sendByEmail = sendInvitations
							? (this.getNodeParameter('sendByEmail', i, true) as boolean)
							: false;
						const sendByWhatsapp = sendInvitations
							? (this.getNodeParameter('sendByWhatsapp', i, false) as boolean)
							: false;

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

						// Get file as base64
						let fileBase64: string;
						let fileName: string;

						if (fileSource === 'url') {
							const fileUrl = this.getNodeParameter('fileUrl', i) as string;
							// Download the file and convert to base64
							const fileBuffer = await this.helpers.httpRequest({
								method: 'GET',
								url: fileUrl,
								encoding: 'arraybuffer',
								returnFullResponse: false,
							}) as Buffer;
							fileBase64 = Buffer.from(fileBuffer).toString('base64');
							// Extract filename from URL or use default
							const urlParts = fileUrl.split('/');
							fileName = urlParts[urlParts.length - 1] || 'document.pdf';
						} else {
							// Binary upload
							const binaryProperty = this.getNodeParameter('binaryProperty', i) as string;
							const binaryData = this.helpers.assertBinaryData(i, binaryProperty);
							const buffer = await this.helpers.getBinaryDataBuffer(i, binaryProperty);
							fileBase64 = buffer.toString('base64');
							fileName = binaryData.fileName || 'document.pdf';
						}

						// Build signatureValidation from toggle options
						const signatureValidation: Record<string, boolean> = {
							autografa: verifyAutografa,
							FEA: verifyFea,
							nom151: verifyNom151,
							biometric_signature: verifyVideo,
							confirm_name_to_finish: verifyConfirmName,
						};

						if (verifyIdentity) {
							const verifyIdScan = this.getNodeParameter('verifyIdScan', i, false) as boolean;
							const verifyBiometricSelfie = this.getNodeParameter('verifyBiometricSelfie', i, false) as boolean;
							if (verifyBiometricSelfie) {
								const verifySynthId = this.getNodeParameter('verifySynthId', i, false) as boolean;
								signatureValidation.ai_verification = verifySynthId;
							}
							// ID scan and biometric selfie are handled by the platform
							if (verifyIdScan) signatureValidation.ai_verification = true;
						}

						// Build participants from signers (include whatsapp if provided)
						const participants = signersData.map((signer) => {
							const participant: Record<string, string> = {
								email: signer.email,
								name: signer.name,
							};
							if (signer.whatsapp && signer.whatsapp.trim() !== '') {
								participant.whatsapp = signer.whatsapp.trim();
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
							// Coordinate placement
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

// Step 1: Create document WITHOUT sending invitations
// Invitations are sent separately via invite-bulk endpoint
// which uses the new GuestSession flow with correct WhatsApp template
const hasParticipants = participants.length > 0;
const startAtStep = hasParticipants ? 2 : 1;

const body: Record<string, unknown> = {
document: {
base64Content: fileBase64,
name: fileName.endsWith('.pdf') ? fileName : `${documentName}.pdf`,
},
participants,
signatureValidation,
config: {
sendInvitations: false,
sendByEmail: false,
sendByWhatsapp: false,
startAtStep,
},
};

// Only include fields if any were defined
if (fields.length > 0) {
body.fields = fields;
}

const createResponse = await this.helpers.httpRequest({
method: 'POST',
headers: authHeaders,
url: `${baseUrl}/v2/documents/`,
body,
json: true,
}) as IDataObject;

const documentId = createResponse.id as string;

// Step 2: Send invitations via invite-bulk (new GuestSession flow)
if (sendInvitations && hasParticipants && documentId) {
const inviteBody = {
participants: participants.map((p) => { const part: Record<string, string> = { email: p.email }; if (p.whatsapp) part.whatsapp = p.whatsapp; if (p.name) part.name = p.name; return part; }),
config: {
sendInvitationByEmail: sendByEmail,
sendInvitationByWhatsapp: sendByWhatsapp,
invitedByEmail: participants[0]?.email || '',
},
};

try {
const inviteResponse = await this.helpers.httpRequest({
method: 'POST',
headers: authHeaders,
url: `${baseUrl}/v2/documents/${documentId}/invite-bulk`,
body: inviteBody,
json: true,
}) as IDataObject;

createResponse.invitations = inviteResponse;
} catch (inviteError) {
const invErr = inviteError as { message?: string };
createResponse.invitationError = invErr.message || 'Failed to send invitations';
}
}

returnData.push({ json: createResponse });

					}
				}
			} catch (error) {
				if (this.continueOnFail()) {
					returnData.push({ json: { error: (error as Error).message } });
					continue;
				}

				const err = error as {
					response?: { data?: { message?: string; error?: string; detail?: string | object }; status?: number };
					message?: string;
					context?: { itemIndex?: number };
				};
				const errorData = err.response?.data || {};
				let apiMessage = errorData.message || errorData.error || err.message || 'Unknown error';

				// Handle detail field (AllSign returns errors in detail)
				if (errorData.detail) {
					if (typeof errorData.detail === 'string') {
						apiMessage = errorData.detail;
					} else {
						apiMessage = JSON.stringify(errorData.detail);
					}
				}

				throw new NodeOperationError(this.getNode(), `AllSign API Error: ${apiMessage}`, {
					itemIndex: i,
					description: `HTTP Status Code: ${err.response?.status || 'N/A'}`,
				});
			}
		}

		return [returnData];
	}
}
