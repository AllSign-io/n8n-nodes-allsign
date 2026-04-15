import type { IExecuteFunctions } from 'n8n-workflow';
import { Allsign } from './Allsign.node';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type NodeProp = Record<string, any>;
// ============================================================
// Mock Helper
// ============================================================
const mockHttpRequest = jest.fn();
const mockHttpRequestWithAuthentication = jest.fn();
const mockAssertBinaryData = jest.fn();
const mockGetBinaryDataBuffer = jest.fn();

const getMockExecuteFunctions = (params: Record<string, unknown>): IExecuteFunctions => {
	return {
		getInputData: () => [{ json: {} }],
		getNodeParameter: (name: string, _index: number, fallback?: unknown) => {
			const val = params[name];
			if (val === undefined && fallback !== undefined) return fallback;
			if (val === undefined) return '';
			return val;
		},
		getCredentials: async () => ({
			apiKey: 'allsign_live_sk_test123',
			baseUrl: 'https://api.allsign.io',
			ownerEmail: 'owner@allsign.io',
		}),
		helpers: {
			httpRequest: mockHttpRequest,
			httpRequestWithAuthentication: mockHttpRequestWithAuthentication,
			assertBinaryData: mockAssertBinaryData,
			getBinaryDataBuffer: mockGetBinaryDataBuffer,
		} as unknown as IExecuteFunctions['helpers'],
		continueOnFail: () => false,
		getNode: () => ({ name: 'AllSign' }),
	} as unknown as IExecuteFunctions;
};

// ============================================================
// Tests
// ============================================================
describe('AllSign Node', () => {
	const node = new Allsign();

	beforeEach(() => {
		jest.clearAllMocks();
	});

	// ----------------------------------------------------------
	// Description / Metadata
	// ----------------------------------------------------------
	describe('Node Description', () => {
		it('should have correct display name', () => {
			expect(node.description.displayName).toBe('AllSign');
		});

		it('should NOT have resource or operation properties (single-purpose node)', () => {
			const resourceProp = node.description.properties.find(
				(p) => p.name === 'resource',
			);
			const operationProp = node.description.properties.find(
				(p) => p.name === 'operation',
			);
			expect(resourceProp).toBeUndefined();
			expect(operationProp).toBeUndefined();
		});

		it('should have collapsible collections for Configuration, Signature Validations, Permissions, and Folder', () => {
			const config = node.description.properties.find(
				(p) => p.name === 'configuration',
			);
			const sigValidations = node.description.properties.find(
				(p) => p.name === 'signatureValidations',
			);
			const permissions = node.description.properties.find(
				(p) => p.name === 'permissions',
			);
			const folder = node.description.properties.find(
				(p) => p.name === 'folderSettings',
			);
			expect(config).toBeDefined();
			expect((config as NodeProp).type).toBe('collection');
			expect(sigValidations).toBeDefined();
			expect((sigValidations as NodeProp).type).toBe('collection');
			expect(permissions).toBeDefined();
			expect((permissions as NodeProp).type).toBe('collection');
			expect(folder).toBeDefined();
			expect((folder as NodeProp).type).toBe('collection');
		});

		it('should have binary option in file source and folder name inside folder settings', () => {
			const fileSourceProp = node.description.properties.find(
				(p) => p.name === 'fileSource',
			);
			const fileSourceOptions = (fileSourceProp as NodeProp).options!.map((o: NodeProp) => o.value);
			expect(fileSourceOptions).toContain('binary');

			const folderOpts = node.description.properties.find(
				(p) => p.name === 'folderSettings',
			);
			const folderOptions = (folderOpts as NodeProp).options!.map((o: NodeProp) => o.name);
			expect(folderOptions).toContain('folderName');
			expect(folderOptions).toContain('folderId');
		});

		it('should have codex aliases for discoverability including WhatsApp', () => {
			const aliases = node.description.codex?.alias || [];
			expect(aliases).toContain('Signature');
			expect(aliases).toContain('PDF');
			expect(aliases).toContain('NOM-151');
			expect(aliases).toContain('FEA');
			expect(aliases).toContain('eIDAS');
			expect(aliases).toContain('WhatsApp');
			// Spanish aliases should NOT be present
			expect(aliases).not.toContain('Firma');
			expect(aliases).not.toContain('Documento');
			expect(aliases).not.toContain('Firmante');
		});

		it('should be usable as a tool', () => {
			expect(node.description.usableAsTool).toBe(true);
		});

		it('should have autógrafa inside Signature Validations, not Notifications', () => {
			const sigValidations = node.description.properties.find(
				(p) => p.name === 'signatureValidations',
			);
			const sigOptions = (sigValidations as NodeProp).options.map((o: NodeProp) => o.name);
			expect(sigOptions).toContain('verifyAutografa');

			const notifSettings = node.description.properties.find(
				(p) => p.name === 'configuration',
			);
			const notifOptions = (notifSettings as NodeProp).options.map((o: NodeProp) => o.name);
			expect(notifOptions).not.toContain('verifyAutografa');
		});

		it('should have eIDAS in Signature Validations', () => {
			const sigValidations = node.description.properties.find(
				(p) => p.name === 'signatureValidations',
			);
			const sigOptions = (sigValidations as NodeProp).options.map((o: NodeProp) => o.name);
			expect(sigOptions).toContain('verifyEidas');
		});

		it('should NOT have deprecated sendByEmail/sendByWhatsapp in Notifications', () => {
			const notifSettings = node.description.properties.find(
				(p) => p.name === 'configuration',
			);
			const notifOptions = (notifSettings as NodeProp).options.map((o: NodeProp) => o.name);
			expect(notifOptions).not.toContain('sendByEmail');
			expect(notifOptions).not.toContain('sendByWhatsapp');
			expect(notifOptions).toContain('sendInvitations');
		});

		it('should have deliveryMethod dropdown in signers', () => {
			const signers = node.description.properties.find(
				(p) => p.name === 'signers',
			);
			const signerFields = (signers as NodeProp).options![0].values!;
			const methodField = signerFields.find((f: NodeProp) => f.name === 'deliveryMethod');
			expect(methodField).toBeDefined();
			expect(methodField.type).toBe('options');
			const optionValues = methodField.options.map((o: NodeProp) => o.value);
			expect(optionValues).toContain('email');
			expect(optionValues).toContain('whatsapp');
		});

		it('should have sendInvitations, expiresAt, and templateVariables in Configuration', () => {
			const config = node.description.properties.find(
				(p) => p.name === 'configuration',
			);
			const optNames = (config as NodeProp).options!.map((o: NodeProp) => o.name);
			expect(optNames).toContain('sendInvitations');
			expect(optNames).toContain('expiresAt');
			expect(optNames).toContain('templateVariables');
		});

		it('should have Permissions collection with ownerEmail, collaborators, isPublicRead', () => {
			const perms = node.description.properties.find(
				(p) => p.name === 'permissions',
			);
			expect(perms).toBeDefined();
			expect((perms as NodeProp).type).toBe('collection');
			const optNames = (perms as NodeProp).options!.map((o: NodeProp) => o.name);
			expect(optNames).toContain('ownerEmail');
			expect(optNames).toContain('collaborators');
			expect(optNames).toContain('isPublicRead');
		});
	});

	// ----------------------------------------------------------
	// Create & Send (URL) — V2 Schema
	// ----------------------------------------------------------
	describe('Create & Send (URL)', () => {
		it('should POST with V2 schema and no deprecated config fields', async () => {
			const pdfBuffer = Buffer.from('fake-pdf-content');
			mockHttpRequest.mockResolvedValueOnce(pdfBuffer); // 1: download PDF (no auth)
			mockHttpRequestWithAuthentication.mockResolvedValueOnce({ id: 'doc-123', name: 'Test Contract' }); // 2: create doc
			mockHttpRequestWithAuthentication.mockResolvedValueOnce({ authenticatedUser: 'owner@allsign.io' }); // 3: security
			mockHttpRequestWithAuthentication.mockResolvedValueOnce({ success: true }); // 4: add-signer
			mockHttpRequestWithAuthentication.mockResolvedValueOnce({ success: true }); // 5: add-field
			mockHttpRequestWithAuthentication.mockResolvedValueOnce({ invited: 1 }); // 6: invite-bulk

			const fn = getMockExecuteFunctions({
				documentName: 'Test Contract',
				fileSource: 'url',
				fileUrl: 'https://example.com/contract.pdf',
				'signers.signerValues': [{ name: 'John', deliveryMethod: 'email', email: 'john@test.com' }],
				configuration: { sendInvitations: true },
				signatureValidations: { verifyAutografa: true },
			});

			const result = await node.execute.call(fn);

			// 1: download PDF (no auth - uses httpRequest)
			expect(mockHttpRequest).toHaveBeenCalledTimes(1);
			expect(mockHttpRequest).toHaveBeenNthCalledWith(1, expect.objectContaining({
				method: 'GET',
				url: 'https://example.com/contract.pdf',
			}));

			// API calls use httpRequestWithAuthentication
			expect(mockHttpRequestWithAuthentication).toHaveBeenCalledTimes(5);

			// 2: create doc (no participants in body)
			const postCall = mockHttpRequestWithAuthentication.mock.calls[0][1];
			expect(postCall.method).toBe('POST');
			expect(postCall.url).toBe('https://api.allsign.io/v2/documents/');

			const body = postCall.body;
			expect(body.document).toEqual({
				base64Content: pdfBuffer.toString('base64'),
				name: 'contract.pdf',
			});
			// Participants are NOT in create body (added via /add-signer)
			expect(body.participants).toBeUndefined();
			expect(body.signatureValidation).toEqual(expect.objectContaining({
				autografa: true,
				FEA: false,
				nom151: false,
			}));
			expect(body.fields).toBeUndefined();
			expect(body.config).toEqual({ sendInvitations: false, startAtStep: 1 });
			expect(body.config).not.toHaveProperty('sendByEmail');
			expect(body.config).not.toHaveProperty('sendByWhatsapp');

			// 3: security endpoint
			expect(mockHttpRequestWithAuthentication.mock.calls[1][1].url).toBe('https://api.allsign.io/v2/test/security');

			// 4: add-signer
			const addSignerCall = mockHttpRequestWithAuthentication.mock.calls[2][1];
			expect(addSignerCall.method).toBe('POST');
			expect(addSignerCall.url).toBe('https://api.allsign.io/v2/documents/doc-123/add-signer');
			expect(addSignerCall.body.signerEmail).toBe('john@test.com');
			expect(addSignerCall.body.invitedByEmail).toBe('owner@allsign.io');

			// 5: add auto-generated signature field
			const fieldCall = mockHttpRequestWithAuthentication.mock.calls[3][1];
			expect(fieldCall.method).toBe('POST');
			expect(fieldCall.url).toBe('https://api.allsign.io/v2/documents/doc-123/signature-fields');
			expect(fieldCall.body.signerEmail).toBe('john@test.com');

			// 6: invite-bulk
			const inviteCall = mockHttpRequestWithAuthentication.mock.calls[4][1];
			expect(inviteCall.method).toBe('POST');
			expect(inviteCall.url).toBe('https://api.allsign.io/v2/documents/doc-123/invite-bulk');
			expect(inviteCall.body.config).toEqual({ invitedByEmail: 'owner@allsign.io' });

			expect(result[0][0].json).toEqual(expect.objectContaining({ id: 'doc-123', name: 'Test Contract', invitations: { invited: 1 } }));
		});

		it('should default autografa to true when signatureValidations is empty', async () => {
			const pdfBuffer = Buffer.from('simple-pdf');
			mockHttpRequest.mockResolvedValueOnce(pdfBuffer);
			mockHttpRequestWithAuthentication.mockResolvedValueOnce({ id: 'doc-456' });

			const fn = getMockExecuteFunctions({
				documentName: 'Simple Doc',
				fileSource: 'url',
				fileUrl: 'https://example.com/simple.pdf',
				'signers.signerValues': [{ name: 'Jane', deliveryMethod: 'email', email: 'jane@test.com' }],
				configuration: { sendInvitations: true },
				signatureValidations: {},
			});

			await node.execute.call(fn);
			const postBody = mockHttpRequestWithAuthentication.mock.calls[0][1].body;

			expect(postBody.signatureValidation.autografa).toBe(true);
		});

		it('should set config to no invitations when no signers provided', async () => {
			const pdfBuffer = Buffer.from('draft-pdf');
			mockHttpRequest.mockResolvedValueOnce(pdfBuffer);
			mockHttpRequestWithAuthentication.mockResolvedValueOnce({ id: 'doc-draft' });

			const fn = getMockExecuteFunctions({
				documentName: 'Draft Doc',
				fileSource: 'url',
				fileUrl: 'https://example.com/draft.pdf',
				'signers.signerValues': [],
				configuration: { sendInvitations: true },
				signatureValidations: {},
			});

			await node.execute.call(fn);
			const postBody = mockHttpRequestWithAuthentication.mock.calls[0][1].body;
			expect(postBody.config).toEqual({
				sendInvitations: false,
				startAtStep: 1,
			});
			expect(postBody.participants).toBeUndefined();
		});
	});

	// ----------------------------------------------------------
	// Create & Send (Binary) — V2 Schema
	// ----------------------------------------------------------
	describe('Create & Send (Binary)', () => {
		it('should use binary data and POST with V2 document schema', async () => {
			const binaryBuffer = Buffer.from('binary-pdf-content');
			mockAssertBinaryData.mockReturnValueOnce({ fileName: 'contract.pdf' });
			mockGetBinaryDataBuffer.mockResolvedValueOnce(binaryBuffer);
			mockHttpRequestWithAuthentication.mockResolvedValueOnce({ id: 'doc-bin', name: 'Binary Upload' }); // 1: create
			mockHttpRequestWithAuthentication.mockResolvedValueOnce({ authenticatedUser: 'owner@allsign.io' }); // 2: security
			mockHttpRequestWithAuthentication.mockResolvedValueOnce({ success: true }); // 3: add-signer
			mockHttpRequestWithAuthentication.mockResolvedValueOnce({ success: true }); // 4: add-field
			mockHttpRequestWithAuthentication.mockResolvedValueOnce({ invited: 1 }); // 5: invite-bulk

			const fn = getMockExecuteFunctions({
				documentName: 'Binary Upload',
				fileSource: 'binary',
				binaryProperty: 'data',
				'signers.signerValues': [{ name: 'Bob', deliveryMethod: 'email', email: 'bob@test.com' }],
				configuration: { sendInvitations: true },
				signatureValidations: {},
			});

			const result = await node.execute.call(fn);

			expect(mockHttpRequestWithAuthentication).toHaveBeenCalledTimes(5);

			// 1: create doc (no participants)
			const postCall = mockHttpRequestWithAuthentication.mock.calls[0][1];
			expect(postCall.method).toBe('POST');
			expect(postCall.url).toBe('https://api.allsign.io/v2/documents/');
			expect(postCall.body.participants).toBeUndefined();
			expect(postCall.body.fields).toBeUndefined();

			// 2: security
			expect(mockHttpRequestWithAuthentication.mock.calls[1][1].url).toBe('https://api.allsign.io/v2/test/security');

			// 3: add-signer
			const addSignerCall = mockHttpRequestWithAuthentication.mock.calls[2][1];
			expect(addSignerCall.url).toBe('https://api.allsign.io/v2/documents/doc-bin/add-signer');
			expect(addSignerCall.body.signerEmail).toBe('bob@test.com');

			// 4: add-field
			const fieldCall = mockHttpRequestWithAuthentication.mock.calls[3][1];
			expect(fieldCall.url).toBe('https://api.allsign.io/v2/documents/doc-bin/signature-fields');

			// 5: invite-bulk
			const inviteCall = mockHttpRequestWithAuthentication.mock.calls[4][1];
			expect(inviteCall.url).toBe('https://api.allsign.io/v2/documents/doc-bin/invite-bulk');
			expect(inviteCall.body.config).toEqual({ invitedByEmail: 'owner@allsign.io' });

			expect(result[0][0].json).toEqual(expect.objectContaining({ id: 'doc-bin', name: 'Binary Upload', invitations: { invited: 1 } }));
		});

		it('should use documentName.pdf when binary has no fileName', async () => {
			const binaryBuffer = Buffer.from('content');
			mockAssertBinaryData.mockReturnValueOnce({ fileName: undefined });
			mockGetBinaryDataBuffer.mockResolvedValueOnce(binaryBuffer);
			mockHttpRequestWithAuthentication.mockResolvedValueOnce({ id: 'doc-noname' });

			const fn = getMockExecuteFunctions({
				documentName: 'Unnamed Doc',
				fileSource: 'binary',
				binaryProperty: 'data',
				'signers.signerValues': [],
				configuration: { sendInvitations: false },
				signatureValidations: {},
			});

			await node.execute.call(fn);
			const body = mockHttpRequestWithAuthentication.mock.calls[0][1].body;
			expect(body.document.name).toBe('document.pdf');
		});
	});

	// ----------------------------------------------------------
	// Phone-Only Signers (WhatsApp)
	// ----------------------------------------------------------
	describe('Phone-Only Signers', () => {
		it('should create participant with only whatsapp (no email)', async () => {
			const pdfBuffer = Buffer.from('pdf');
			mockHttpRequest.mockResolvedValueOnce(pdfBuffer); // 1: download
			mockHttpRequestWithAuthentication.mockResolvedValueOnce({ id: 'doc-phone' }); // 2: create
			mockHttpRequestWithAuthentication.mockResolvedValueOnce({ authenticatedUser: 'owner@allsign.io' }); // 3: security
			mockHttpRequestWithAuthentication.mockResolvedValueOnce({ success: true }); // 4: add-signer
			mockHttpRequestWithAuthentication.mockResolvedValueOnce({ invited: 1 }); // 5: invite-bulk

			const fn = getMockExecuteFunctions({
				documentName: 'Phone Signer Doc',
				fileSource: 'url',
				fileUrl: 'https://example.com/doc.pdf',
				'signers.signerValues': [{
					name: 'Carlos',
					deliveryMethod: 'whatsapp',
					whatsapp: '+525512345678',
				}],
				configuration: { sendInvitations: true },
				signatureValidations: {},
			});

			await node.execute.call(fn);

			// Create body should NOT have participants
			const createBody = mockHttpRequestWithAuthentication.mock.calls[0][1].body;
			expect(createBody.participants).toBeUndefined();

			// add-signer should have WhatsApp phone
			const addSignerCall = mockHttpRequestWithAuthentication.mock.calls[2][1];
			expect(addSignerCall.url).toBe('https://api.allsign.io/v2/documents/doc-phone/add-signer');
			expect(addSignerCall.body.signerPhone).toBe('+525512345678');
			expect(addSignerCall.body.signerEmail).toBeUndefined();
		});

		it('should only include the selected delivery method channel', async () => {
			const pdfBuffer = Buffer.from('pdf');
			mockHttpRequest.mockResolvedValueOnce(pdfBuffer); // download
			mockHttpRequestWithAuthentication.mockResolvedValueOnce({ id: 'doc-email-only' }); // create
			mockHttpRequestWithAuthentication.mockResolvedValueOnce({ authenticatedUser: 'owner@allsign.io' }); // security
			mockHttpRequestWithAuthentication.mockResolvedValueOnce({ success: true }); // add-signer
			mockHttpRequestWithAuthentication.mockResolvedValueOnce({ success: true }); // add-field
			mockHttpRequestWithAuthentication.mockResolvedValueOnce({ invited: 1 }); // invite-bulk

			const fn = getMockExecuteFunctions({
				documentName: 'Single Channel Doc',
				fileSource: 'url',
				fileUrl: 'https://example.com/doc.pdf',
				'signers.signerValues': [{
					name: 'Maria',
					deliveryMethod: 'email',
					email: 'maria@test.com',
				}],
				configuration: { sendInvitations: true },
				signatureValidations: {},
			});

			await node.execute.call(fn);

			// Create body should NOT have participants
			const createBody = mockHttpRequestWithAuthentication.mock.calls[0][1].body;
			expect(createBody.participants).toBeUndefined();

			// add-signer should have ONLY email (no phone)
			const addSignerCall = mockHttpRequestWithAuthentication.mock.calls[2][1];
			expect(addSignerCall.body.signerEmail).toBe('maria@test.com');
			expect(addSignerCall.body.signerPhone).toBeUndefined();
		});

		it('should throw when email delivery method has no email', async () => {
			const pdfBuffer = Buffer.from('pdf');
			mockHttpRequest.mockResolvedValueOnce(pdfBuffer);

			const fn = getMockExecuteFunctions({
				documentName: 'Invalid Signer',
				fileSource: 'url',
				fileUrl: 'https://example.com/doc.pdf',
				'signers.signerValues': [{
					name: 'NoEmail',
					deliveryMethod: 'email',
					email: '',
				}],
				configuration: { sendInvitations: true },
				signatureValidations: {},
			});

			await expect(node.execute.call(fn)).rejects.toThrow(
				'Signer "NoEmail" has Email as delivery method but no email address was provided',
			);
		});

		it('should throw when WhatsApp delivery method has no number', async () => {
			const pdfBuffer = Buffer.from('pdf');
			mockHttpRequest.mockResolvedValueOnce(pdfBuffer);

			const fn = getMockExecuteFunctions({
				documentName: 'Invalid Signer',
				fileSource: 'url',
				fileUrl: 'https://example.com/doc.pdf',
				'signers.signerValues': [{
					name: 'NoPhone',
					deliveryMethod: 'whatsapp',
					whatsapp: '',
				}],
				configuration: { sendInvitations: true },
				signatureValidations: {},
			});

			await expect(node.execute.call(fn)).rejects.toThrow(
				'Signer "NoPhone" has WhatsApp as delivery method but no WhatsApp number was provided',
			);
		});

		it('should handle invite-bulk with phone-only participants', async () => {
			const pdfBuffer = Buffer.from('pdf');
			mockHttpRequest.mockResolvedValueOnce(pdfBuffer); // download
			mockHttpRequestWithAuthentication.mockResolvedValueOnce({ id: 'doc-invite-phone' }); // create
			mockHttpRequestWithAuthentication.mockResolvedValueOnce({ authenticatedUser: 'owner@allsign.io' }); // security
			mockHttpRequestWithAuthentication.mockResolvedValueOnce({ success: true }); // add-signer
			mockHttpRequestWithAuthentication.mockResolvedValueOnce({ success: true }); // auto-gen signature-field
			mockHttpRequestWithAuthentication.mockResolvedValueOnce({ invited: 1 }); // invite-bulk

			const fn = getMockExecuteFunctions({
				documentName: 'Invite Phone Doc',
				fileSource: 'url',
				fileUrl: 'https://example.com/doc.pdf',
				'signers.signerValues': [{
					name: 'Luis',
					deliveryMethod: 'whatsapp',
					whatsapp: '+12125551234',
				}],
				configuration: { sendInvitations: true },
				signatureValidations: {},
			});

			await node.execute.call(fn);
			// Fields are never in create body
			const createBody = mockHttpRequestWithAuthentication.mock.calls[0][1].body;
			expect(createBody.fields).toBeUndefined();

			// invite-bulk is at index 5 (download, create, security, add-signer, field, invite-bulk)
			const inviteCall = mockHttpRequestWithAuthentication.mock.calls[4][1];
			const inviteBody = inviteCall.body;

			expect(inviteBody.participants[0]).toEqual({
				name: 'Luis',
				whatsapp: '+12125551234',
			});
			expect(inviteBody.participants[0]).not.toHaveProperty('email');
			expect(inviteBody.config).toEqual({ invitedByEmail: 'owner@allsign.io' });
		});
	});

	// ----------------------------------------------------------
	// Signature Validation (V2 Schema)
	// ----------------------------------------------------------
	describe('Signature Validation', () => {
		it('should map video to videofirma and biometric to biometric_signature', async () => {
			const pdfBuffer = Buffer.from('pdf');
			mockHttpRequest.mockResolvedValueOnce(pdfBuffer);
			mockHttpRequestWithAuthentication.mockResolvedValueOnce({ id: 'doc-mapping' });

			const fn = getMockExecuteFunctions({
				documentName: 'Mapping Doc',
				fileSource: 'url',
				fileUrl: 'https://example.com/doc.pdf',
				'signers.signerValues': [{ name: 'Test', deliveryMethod: 'email', email: 'test@test.com' }],
				configuration: { sendInvitations: true },
				signatureValidations: {
					verifyVideo: true,
					verifyBiometricSelfie: true,
				},
			});

			await node.execute.call(fn);
			const body = mockHttpRequestWithAuthentication.mock.calls[0][1].body;
			expect(body.signatureValidation.videofirma).toBe(true);
			expect(body.signatureValidation.biometric_signature).toBe(true);
			expect(body.signatureValidation).not.toHaveProperty('biometric_signature_wrong');
		});

		it('should set all validation fields correctly', async () => {
			const pdfBuffer = Buffer.from('pdf');
			mockHttpRequest.mockResolvedValueOnce(pdfBuffer);
			mockHttpRequestWithAuthentication.mockResolvedValueOnce({ id: 'doc-ver' });

			const fn = getMockExecuteFunctions({
				documentName: 'Verified Doc',
				fileSource: 'url',
				fileUrl: 'https://example.com/doc.pdf',
				'signers.signerValues': [{ name: 'Test', deliveryMethod: 'email', email: 'test@test.com' }],
				configuration: { sendInvitations: true },
				signatureValidations: {
					verifyAutografa: true,
					verifyFea: true,
					verifyEidas: true,
					verifyNom151: true,
					verifyConfirmName: true,
					verifyIdScan: true,
				},
			});

			await node.execute.call(fn);
			const body = mockHttpRequestWithAuthentication.mock.calls[0][1].body;
			expect(body.signatureValidation).toEqual(expect.objectContaining({
				autografa: true,
				FEA: true,
				eIDAS: true,
				nom151: true,
				confirm_name_to_finish: true,
				id_scan: true,
				videofirma: false,
				biometric_signature: false,
			}));
		});

		it('should set ai_verification when identity + idScan enabled', async () => {
			const pdfBuffer = Buffer.from('pdf');
			mockHttpRequest.mockResolvedValueOnce(pdfBuffer);
			mockHttpRequestWithAuthentication.mockResolvedValueOnce({ id: 'doc-id' });

			const fn = getMockExecuteFunctions({
				documentName: 'Identity Doc',
				fileSource: 'url',
				fileUrl: 'https://example.com/doc.pdf',
				'signers.signerValues': [{ name: 'Test', deliveryMethod: 'email', email: 'test@test.com' }],
				configuration: { sendInvitations: true },
				signatureValidations: {
					verifyIdentity: true,
					verifyIdScan: true,
					verifyBiometricSelfie: true,
					verifySynthId: true,
				},
			});

			await node.execute.call(fn);
			const body = mockHttpRequestWithAuthentication.mock.calls[0][1].body;
			expect(body.signatureValidation.ai_verification).toBe(true);
			expect(body.signatureValidation.id_scan).toBe(true);
			expect(body.signatureValidation.biometric_signature).toBe(true);
		});

		it('should not include ai_verification when identity is disabled', async () => {
			const pdfBuffer = Buffer.from('pdf');
			mockHttpRequest.mockResolvedValueOnce(pdfBuffer);
			mockHttpRequestWithAuthentication.mockResolvedValueOnce({ id: 'doc-noid' });

			const fn = getMockExecuteFunctions({
				documentName: 'No Identity Doc',
				fileSource: 'url',
				fileUrl: 'https://example.com/doc.pdf',
				'signers.signerValues': [{ name: 'Test', deliveryMethod: 'email', email: 'test@test.com' }],
				configuration: { sendInvitations: true },
				signatureValidations: {},
			});

			await node.execute.call(fn);
			const body = mockHttpRequestWithAuthentication.mock.calls[0][1].body;
			expect(body.signatureValidation).not.toHaveProperty('ai_verification');
		});
	});

	// ----------------------------------------------------------
	// New Features (Placeholders, ExpiresAt)
	// ----------------------------------------------------------
	describe('New Features', () => {
		it('should include template with variables wrapper when templateVariables provided', async () => {
			const pdfBuffer = Buffer.from('pdf');
			mockHttpRequest.mockResolvedValueOnce(pdfBuffer);
			mockHttpRequestWithAuthentication.mockResolvedValueOnce({ id: 'doc-template' });

			const fn = getMockExecuteFunctions({
				documentName: 'Template Doc',
				fileSource: 'url',
				fileUrl: 'https://example.com/template.docx',
				'signers.signerValues': [],
				configuration: {
					sendInvitations: false,
					templateVariables: '{"client_name": "Juan", "amount": "$10,000"}',
				},
				signatureValidations: {},
			});

			await node.execute.call(fn);
			const body = mockHttpRequestWithAuthentication.mock.calls[0][1].body;
			expect(body.placeholders).toEqual({ client_name: 'Juan', amount: '$10,000' });
		});

		it('should not include template when empty', async () => {
			const pdfBuffer = Buffer.from('pdf');
			mockHttpRequest.mockResolvedValueOnce(pdfBuffer);
			mockHttpRequestWithAuthentication.mockResolvedValueOnce({ id: 'doc-no-tmpl' });

			const fn = getMockExecuteFunctions({
				documentName: 'No Template',
				fileSource: 'url',
				fileUrl: 'https://example.com/doc.pdf',
				'signers.signerValues': [],
				configuration: { sendInvitations: false },
				signatureValidations: {},
			});

			await node.execute.call(fn);
			const body = mockHttpRequestWithAuthentication.mock.calls[0][1].body;
			expect(body).not.toHaveProperty('template');
		});

		it('should include expiresAt in config when provided', async () => {
			const pdfBuffer = Buffer.from('pdf');
			mockHttpRequest.mockResolvedValueOnce(pdfBuffer);
			mockHttpRequestWithAuthentication.mockResolvedValueOnce({ id: 'doc-expires' });

			const fn = getMockExecuteFunctions({
				documentName: 'Expiring Doc',
				fileSource: 'url',
				fileUrl: 'https://example.com/doc.pdf',
				'signers.signerValues': [],
				configuration: {
					sendInvitations: false,
					expiresAt: '2026-04-01T00:00:00Z',
				},
				signatureValidations: {},
			});

			await node.execute.call(fn);
			const body = mockHttpRequestWithAuthentication.mock.calls[0][1].body;
			expect(body.config.expiresAt).toBe('2026-04-01T00:00:00Z');
		});

		it('should use folderId over folderName when both provided', async () => {
			const pdfBuffer = Buffer.from('pdf');
			mockHttpRequest.mockResolvedValueOnce(pdfBuffer);
			mockHttpRequestWithAuthentication.mockResolvedValueOnce({ id: 'doc-folder' });

			const fn = getMockExecuteFunctions({
				documentName: 'Folder Doc',
				fileSource: 'url',
				fileUrl: 'https://example.com/doc.pdf',
				'signers.signerValues': [],
				configuration: { sendInvitations: false },
				signatureValidations: {},
				folderSettings: {
					folderId: 'folder-uuid-123',
					folderName: 'Contracts',
				},
			});

			await node.execute.call(fn);
			const body = mockHttpRequestWithAuthentication.mock.calls[0][1].body;
			expect(body.folderId).toBe('folder-uuid-123');
			expect(body).not.toHaveProperty('folderName');
		});

		it('should include permissions when provided', async () => {
			const pdfBuffer = Buffer.from('pdf');
			mockHttpRequest.mockResolvedValueOnce(pdfBuffer);
			mockHttpRequestWithAuthentication.mockResolvedValueOnce({ id: 'doc-perms' });

			const fn = getMockExecuteFunctions({
				documentName: 'Perms Doc',
				fileSource: 'url',
				fileUrl: 'https://example.com/doc.pdf',
				'signers.signerValues': [],
				configuration: { sendInvitations: false },
				signatureValidations: {},
				permissions: {
					ownerEmail: 'legal@company.com',
					collaborators: '[{"email": "cfo@company.com", "permissions": ["read", "sign"]}]',
					isPublicRead: false,
				},
			});

			await node.execute.call(fn);
			const body = mockHttpRequestWithAuthentication.mock.calls[0][1].body;
			expect(body.permissions).toEqual({
				ownerEmail: 'legal@company.com',
				collaborators: [{ email: 'cfo@company.com', permissions: ['read', 'sign'] }],
			});
		});

		it('should not include permissions when empty', async () => {
			const pdfBuffer = Buffer.from('pdf');
			mockHttpRequest.mockResolvedValueOnce(pdfBuffer);
			mockHttpRequestWithAuthentication.mockResolvedValueOnce({ id: 'doc-no-perms' });

			const fn = getMockExecuteFunctions({
				documentName: 'No Perms',
				fileSource: 'url',
				fileUrl: 'https://example.com/doc.pdf',
				'signers.signerValues': [],
				configuration: { sendInvitations: false },
				signatureValidations: {},
			});

			await node.execute.call(fn);
			const body = mockHttpRequestWithAuthentication.mock.calls[0][1].body;
			expect(body).not.toHaveProperty('permissions');
		});
	});

	// ----------------------------------------------------------
	// Multiple Signers
	// ----------------------------------------------------------
	describe('Multiple Signers', () => {
		it('should send multiple participants in one request', async () => {
			const pdfBuffer = Buffer.from('pdf');
			mockHttpRequest.mockResolvedValueOnce(pdfBuffer); // 1: download
			mockHttpRequestWithAuthentication.mockResolvedValueOnce({ id: 'doc-multi', name: 'Multi-Signer' }); // 2: create
			mockHttpRequestWithAuthentication.mockResolvedValueOnce({ authenticatedUser: 'owner@allsign.io' }); // 3: security
			// 3 add-signer calls
			mockHttpRequestWithAuthentication.mockResolvedValueOnce({ success: true }); // 4: add-signer Alice
			mockHttpRequestWithAuthentication.mockResolvedValueOnce({ success: true }); // 5: add-signer Bob
			mockHttpRequestWithAuthentication.mockResolvedValueOnce({ success: true }); // 6: add-signer Charlie
			// 3 auto-generated signature fields
			mockHttpRequestWithAuthentication.mockResolvedValueOnce({ success: true }); // 7: field Alice
			mockHttpRequestWithAuthentication.mockResolvedValueOnce({ success: true }); // 8: field Bob
			mockHttpRequestWithAuthentication.mockResolvedValueOnce({ success: true }); // 9: field Charlie
			mockHttpRequestWithAuthentication.mockResolvedValueOnce({ invited: 3 }); // 10: invite-bulk

			const fn = getMockExecuteFunctions({
				documentName: 'Multi-Signer Doc',
				fileSource: 'url',
				fileUrl: 'https://example.com/doc.pdf',
				'signers.signerValues': [
					{ name: 'Alice', deliveryMethod: 'email', email: 'alice@test.com' },
					{ name: 'Bob', deliveryMethod: 'email', email: 'bob@test.com' },
					{ name: 'Charlie', deliveryMethod: 'email', email: 'charlie@test.com' },
				],
				configuration: { sendInvitations: true },
				signatureValidations: {},
			});

			await node.execute.call(fn);

			// Create body should NOT have participants
			const body = mockHttpRequestWithAuthentication.mock.calls[0][1].body;
			expect(body.participants).toBeUndefined();
			expect(body.fields).toBeUndefined();
			expect(body.config.sendInvitations).toBe(false);
			expect(body.config.startAtStep).toBe(1);

			// download + create + security + 3 add-signer + 3 add-field + invite-bulk = 10
			expect(mockHttpRequestWithAuthentication).toHaveBeenCalledTimes(9);
			const inviteCall = mockHttpRequestWithAuthentication.mock.calls[8][1];
			expect(inviteCall.method).toBe('POST');
			expect(inviteCall.url).toBe('https://api.allsign.io/v2/documents/doc-multi/invite-bulk');
			expect(inviteCall.body.config).toEqual({ invitedByEmail: 'owner@allsign.io' });
		});
	});

	// ----------------------------------------------------------
	// Auth Headers
	// ----------------------------------------------------------
	describe('Auth Headers', () => {
		it('should use httpRequestWithAuthentication with allSignApi credential', async () => {
			const pdfBuffer = Buffer.from('pdf');
			mockHttpRequest.mockResolvedValueOnce(pdfBuffer);
			mockHttpRequestWithAuthentication.mockResolvedValueOnce({ id: 'doc-auth' });

			const fn = getMockExecuteFunctions({
				documentName: 'Auth Test',
				fileSource: 'url',
				fileUrl: 'https://example.com/doc.pdf',
				'signers.signerValues': [],
				configuration: { sendInvitations: false },
				signatureValidations: {},
			});

			await node.execute.call(fn);
			// httpRequestWithAuthentication is called as .call(this, 'allSignApi', opts)
			expect(mockHttpRequestWithAuthentication.mock.calls[0][0]).toBe('allSignApi');
			expect(mockHttpRequestWithAuthentication.mock.calls[0][1].url).toBe('https://api.allsign.io/v2/documents/');
		});
	});

	// ----------------------------------------------------------
	// Base URL Handling
	// ----------------------------------------------------------
	describe('Base URL Handling', () => {
		it('should strip trailing slashes from base URL', async () => {
			const pdfBuffer = Buffer.from('pdf');
			mockHttpRequest.mockResolvedValueOnce(pdfBuffer);
			mockHttpRequestWithAuthentication.mockResolvedValueOnce({ id: 'doc-slash' });

			const fn = getMockExecuteFunctions({
				documentName: 'Slash Test',
				fileSource: 'url',
				fileUrl: 'https://example.com/doc.pdf',
				'signers.signerValues': [],
				configuration: { sendInvitations: false },
				signatureValidations: {},
			});
			(fn as unknown as Record<string, unknown>).getCredentials = async () => ({
				apiKey: 'allsign_live_sk_test123',
				baseUrl: 'https://api.allsign.io/',
			});

			await node.execute.call(fn);
			expect(mockHttpRequestWithAuthentication.mock.calls[0][1].url).toBe('https://api.allsign.io/v2/documents/');
		});

		it('should use custom base URL for dev environments', async () => {
			const pdfBuffer = Buffer.from('pdf');
			mockHttpRequest.mockResolvedValueOnce(pdfBuffer);
			mockHttpRequestWithAuthentication.mockResolvedValueOnce({ id: 'doc-dev' });

			const fn = getMockExecuteFunctions({
				documentName: 'Dev Doc',
				fileSource: 'url',
				fileUrl: 'https://example.com/doc.pdf',
				'signers.signerValues': [],
				configuration: { sendInvitations: false },
				signatureValidations: {},
			});
			(fn as unknown as Record<string, unknown>).getCredentials = async () => ({
				apiKey: 'allsign_trial_sk_dev456',
				baseUrl: 'http://localhost:8000',
			});

			await node.execute.call(fn);
			expect(mockHttpRequestWithAuthentication.mock.calls[0][1].url).toBe('http://localhost:8000/v2/documents/');
		});
	});

	// ----------------------------------------------------------
	// Error Handling
	// ----------------------------------------------------------
	describe('Error Handling', () => {
		it('should throw NodeApiError on API failure', async () => {
			mockHttpRequest.mockResolvedValueOnce(Buffer.from('pdf'));
			mockHttpRequestWithAuthentication.mockRejectedValueOnce({
				message: 'Request failed with status code 402',
				response: { data: { message: 'Insufficient credits' }, status: 402 },
			});

			const fn = getMockExecuteFunctions({
				documentName: 'Error Doc',
				fileSource: 'url',
				fileUrl: 'https://example.com/doc.pdf',
				'signers.signerValues': [{ name: 'Test', deliveryMethod: 'email', email: 'test@test.com' }],
				configuration: { sendInvitations: true },
				signatureValidations: {},
			});

			await expect(node.execute.call(fn)).rejects.toThrow();
		});

		it('should throw when file download fails', async () => {
			mockHttpRequest.mockRejectedValueOnce(new Error('File not found'));

			const fn = getMockExecuteFunctions({
				documentName: 'Bad URL Doc',
				fileSource: 'url',
				fileUrl: 'https://example.com/nonexistent.pdf',
				'signers.signerValues': [{ name: 'Test', deliveryMethod: 'email', email: 'test@test.com' }],
				configuration: { sendInvitations: true },
				signatureValidations: {},
			});

			await expect(node.execute.call(fn)).rejects.toThrow('File not found');
		});

		it('should continue on fail when enabled', async () => {
			mockHttpRequest.mockRejectedValueOnce(new Error('Connection refused'));

			const fn = getMockExecuteFunctions({
				documentName: 'Fail Doc',
				fileSource: 'url',
				fileUrl: 'https://example.com/doc.pdf',
				'signers.signerValues': [],
				configuration: { sendInvitations: false },
				signatureValidations: {},
			});
			(fn as unknown as Record<string, unknown>).continueOnFail = () => true;

			const result = await node.execute.call(fn);
			expect(result[0][0].json).toHaveProperty('error');
		});
	});
});
