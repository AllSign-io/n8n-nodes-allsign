import type {
	IDataObject,
	IExecuteFunctions,
} from 'n8n-workflow';
import { Allsign } from './Allsign.node';


// ============================================================
// Mock Helper
// ============================================================
const mockHttpRequest = jest.fn();
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
		}),
		helpers: {
			httpRequest: mockHttpRequest,
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

		it('should have collapsible collections for Notifications, Signature Validations, and Additional Options', () => {
			const notifSettings = node.description.properties.find(
				(p) => p.name === 'notificationSettings',
			);
			const sigValidations = node.description.properties.find(
				(p) => p.name === 'signatureValidations',
			);
			const additionalOpts = node.description.properties.find(
				(p) => p.name === 'additionalOptions',
			);
			expect(notifSettings).toBeDefined();
			expect((notifSettings as any).type).toBe('collection');
			expect(sigValidations).toBeDefined();
			expect((sigValidations as any).type).toBe('collection');
			expect(additionalOpts).toBeDefined();
			expect((additionalOpts as any).type).toBe('collection');
		});

		it('should have binary option in file source and folder name inside additional options', () => {
			const fileSourceProp = node.description.properties.find(
				(p) => p.name === 'fileSource',
			);
			const fileSourceOptions = (fileSourceProp as any).options.map((o: any) => o.value);
			expect(fileSourceOptions).toContain('binary');

			const additionalOpts = node.description.properties.find(
				(p) => p.name === 'additionalOptions',
			);
			const additionalOptions = (additionalOpts as any).options.map((o: any) => o.name);
			expect(additionalOptions).toContain('folderName');
		});

		it('should have codex aliases for discoverability including WhatsApp', () => {
			const aliases = node.description.codex?.alias || [];
			expect(aliases).toContain('Firma');
			expect(aliases).toContain('Documento');
			expect(aliases).toContain('Signature');
			expect(aliases).toContain('PDF');
			expect(aliases).toContain('NOM-151');
			expect(aliases).toContain('FEA');
			expect(aliases).toContain('eIDAS');
			expect(aliases).toContain('WhatsApp');
		});

		it('should be usable as a tool', () => {
			expect(node.description.usableAsTool).toBe(true);
		});

		it('should have autógrafa inside Signature Validations, not Notifications', () => {
			const sigValidations = node.description.properties.find(
				(p) => p.name === 'signatureValidations',
			);
			const sigOptions = (sigValidations as any).options.map((o: any) => o.name);
			expect(sigOptions).toContain('verifyAutografa');

			const notifSettings = node.description.properties.find(
				(p) => p.name === 'notificationSettings',
			);
			const notifOptions = (notifSettings as any).options.map((o: any) => o.name);
			expect(notifOptions).not.toContain('verifyAutografa');
		});

		it('should have eIDAS in Signature Validations', () => {
			const sigValidations = node.description.properties.find(
				(p) => p.name === 'signatureValidations',
			);
			const sigOptions = (sigValidations as any).options.map((o: any) => o.name);
			expect(sigOptions).toContain('verifyEidas');
		});

		it('should NOT have deprecated sendByEmail/sendByWhatsapp in Notifications', () => {
			const notifSettings = node.description.properties.find(
				(p) => p.name === 'notificationSettings',
			);
			const notifOptions = (notifSettings as any).options.map((o: any) => o.name);
			expect(notifOptions).not.toContain('sendByEmail');
			expect(notifOptions).not.toContain('sendByWhatsapp');
			expect(notifOptions).toContain('sendInvitations');
		});

		it('should have email as optional (not required) for signers', () => {
			const signers = node.description.properties.find(
				(p) => p.name === 'signers',
			);
			const signerFields = (signers as any).options[0].values;
			const emailField = signerFields.find((f: any) => f.name === 'email');
			expect(emailField.required).toBeUndefined();
		});

		it('should have expiresAt, templateVariables, folderId, and folderName in Additional Options', () => {
			const additionalOpts = node.description.properties.find(
				(p) => p.name === 'additionalOptions',
			);
			const optNames = (additionalOpts as any).options.map((o: any) => o.name);
			expect(optNames).toContain('expiresAt');
			expect(optNames).toContain('templateVariables');
			expect(optNames).toContain('folderName');
			expect(optNames).toContain('folderId');
		});

		it('should have Permissions collection with ownerEmail, collaborators, isPublicRead', () => {
			const perms = node.description.properties.find(
				(p) => p.name === 'permissions',
			);
			expect(perms).toBeDefined();
			expect((perms as any).type).toBe('collection');
			const optNames = (perms as any).options.map((o: any) => o.name);
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
			mockHttpRequest.mockResolvedValueOnce(pdfBuffer);
			mockHttpRequest.mockResolvedValueOnce({ id: 'doc-123', name: 'Test Contract' });
			mockHttpRequest.mockResolvedValueOnce({ invited: 1 });

			const fn = getMockExecuteFunctions({
				documentName: 'Test Contract',
				fileSource: 'url',
				fileUrl: 'https://example.com/contract.pdf',
				'signers.signerValues': [{ name: 'John', email: 'john@test.com' }],
				notificationSettings: { sendInvitations: true },
				signatureValidations: { verifyAutografa: true },
			});

			const result = await node.execute.call(fn);

			expect(mockHttpRequest).toHaveBeenCalledTimes(3);

			// First call: download the PDF
			expect(mockHttpRequest).toHaveBeenNthCalledWith(1, expect.objectContaining({
				method: 'GET',
				url: 'https://example.com/contract.pdf',
				encoding: 'arraybuffer',
			}));

			// Second call: POST to V2 documents endpoint
			const postCall = mockHttpRequest.mock.calls[1][0];
			expect(postCall.method).toBe('POST');
			expect(postCall.url).toBe('https://api.allsign.io/v2/documents/');
			expect(postCall.headers).toEqual({ Authorization: 'Bearer allsign_live_sk_test123' });

			const body = postCall.body;
			expect(body.document).toEqual({
				base64Content: pdfBuffer.toString('base64'),
				name: 'contract.pdf',
			});
			expect(body.participants).toEqual([{ name: 'John', email: 'john@test.com' }]);
			expect(body.signatureValidation).toEqual(expect.objectContaining({
				autografa: true,
				FEA: false,
				nom151: false,
			}));

			// Config should NOT have deprecated sendByEmail/sendByWhatsapp
			expect(body.config).toEqual({
				sendInvitations: false,
				startAtStep: 2,
			});
			expect(body.config).not.toHaveProperty('sendByEmail');
			expect(body.config).not.toHaveProperty('sendByWhatsapp');

			// Third call: invite-bulk
			const inviteCall = mockHttpRequest.mock.calls[2][0];
			expect(inviteCall.method).toBe('POST');
			expect(inviteCall.url).toBe('https://api.allsign.io/v2/documents/doc-123/invite-bulk');

			expect(result[0][0].json).toEqual(expect.objectContaining({ id: 'doc-123', name: 'Test Contract' }));
		});

		it('should default autografa to true when signatureValidations is empty', async () => {
			const pdfBuffer = Buffer.from('simple-pdf');
			mockHttpRequest.mockResolvedValueOnce(pdfBuffer);
			mockHttpRequest.mockResolvedValueOnce({ id: 'doc-456' });

			const fn = getMockExecuteFunctions({
				documentName: 'Simple Doc',
				fileSource: 'url',
				fileUrl: 'https://example.com/simple.pdf',
				'signers.signerValues': [{ name: 'Jane', email: 'jane@test.com' }],
				notificationSettings: { sendInvitations: true },
				signatureValidations: {},
			});

			await node.execute.call(fn);
			const postBody = mockHttpRequest.mock.calls[1][0].body;

			expect(postBody.signatureValidation.autografa).toBe(true);
		});

		it('should set config to no invitations when no signers provided', async () => {
			const pdfBuffer = Buffer.from('draft-pdf');
			mockHttpRequest.mockResolvedValueOnce(pdfBuffer);
			mockHttpRequest.mockResolvedValueOnce({ id: 'doc-draft' });

			const fn = getMockExecuteFunctions({
				documentName: 'Draft Doc',
				fileSource: 'url',
				fileUrl: 'https://example.com/draft.pdf',
				'signers.signerValues': [],
				notificationSettings: { sendInvitations: true },
				signatureValidations: {},
			});

			await node.execute.call(fn);
			const postBody = mockHttpRequest.mock.calls[1][0].body;
			expect(postBody.config).toEqual({
				sendInvitations: false,
				startAtStep: 1,
			});
			expect(postBody.participants).toEqual([]);
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
			mockHttpRequest.mockResolvedValueOnce({ id: 'doc-bin', name: 'Binary Upload' });
			mockHttpRequest.mockResolvedValueOnce({ invited: 1 });

			const fn = getMockExecuteFunctions({
				documentName: 'Binary Upload',
				fileSource: 'binary',
				binaryProperty: 'data',
				'signers.signerValues': [{ name: 'Bob', email: 'bob@test.com' }],
				notificationSettings: { sendInvitations: true },
				signatureValidations: {},
			});

			const result = await node.execute.call(fn);

			expect(mockHttpRequest).toHaveBeenCalledTimes(2);

			const postCall = mockHttpRequest.mock.calls[0][0];
			expect(postCall.method).toBe('POST');
			expect(postCall.url).toBe('https://api.allsign.io/v2/documents/');

			const body = postCall.body;
			expect(body.document).toEqual({
				base64Content: binaryBuffer.toString('base64'),
				name: 'contract.pdf',
			});
			expect(body.participants).toEqual([{ name: 'Bob', email: 'bob@test.com' }]);

			const inviteCall = mockHttpRequest.mock.calls[1][0];
			expect(inviteCall.method).toBe('POST');
			expect(inviteCall.url).toBe('https://api.allsign.io/v2/documents/doc-bin/invite-bulk');

			expect(result[0][0].json).toEqual(expect.objectContaining({ id: 'doc-bin', name: 'Binary Upload' }));
		});

		it('should use documentName.pdf when binary has no fileName', async () => {
			const binaryBuffer = Buffer.from('content');
			mockAssertBinaryData.mockReturnValueOnce({ fileName: undefined });
			mockGetBinaryDataBuffer.mockResolvedValueOnce(binaryBuffer);
			mockHttpRequest.mockResolvedValueOnce({ id: 'doc-noname' });

			const fn = getMockExecuteFunctions({
				documentName: 'Unnamed Doc',
				fileSource: 'binary',
				binaryProperty: 'data',
				'signers.signerValues': [],
				notificationSettings: { sendInvitations: false },
				signatureValidations: {},
			});

			await node.execute.call(fn);
			const body = mockHttpRequest.mock.calls[0][0].body;
			expect(body.document.name).toBe('document.pdf');
		});
	});

	// ----------------------------------------------------------
	// Phone-Only Signers (WhatsApp)
	// ----------------------------------------------------------
	describe('Phone-Only Signers', () => {
		it('should create participant with only whatsapp (no email)', async () => {
			const pdfBuffer = Buffer.from('pdf');
			mockHttpRequest.mockResolvedValueOnce(pdfBuffer);
			mockHttpRequest.mockResolvedValueOnce({ id: 'doc-phone' });
			mockHttpRequest.mockResolvedValueOnce({ invited: 1 });

			const fn = getMockExecuteFunctions({
				documentName: 'Phone Signer Doc',
				fileSource: 'url',
				fileUrl: 'https://example.com/doc.pdf',
				'signers.signerValues': [{
					name: 'Carlos',
					email: '',
					countryCode: '+52',
					phoneNumber: '5512345678',
				}],
				notificationSettings: { sendInvitations: true },
				signatureValidations: {},
			});

			await node.execute.call(fn);
			const body = mockHttpRequest.mock.calls[1][0].body;

			expect(body.participants).toEqual([{
				name: 'Carlos',
				whatsapp: '+525512345678',
			}]);
			expect(body.participants[0]).not.toHaveProperty('email');
		});

		it('should include both email and whatsapp when both provided', async () => {
			const pdfBuffer = Buffer.from('pdf');
			mockHttpRequest.mockResolvedValueOnce(pdfBuffer);
			mockHttpRequest.mockResolvedValueOnce({ id: 'doc-both' });
			mockHttpRequest.mockResolvedValueOnce({ invited: 1 });

			const fn = getMockExecuteFunctions({
				documentName: 'Both Channels Doc',
				fileSource: 'url',
				fileUrl: 'https://example.com/doc.pdf',
				'signers.signerValues': [{
					name: 'Maria',
					email: 'maria@test.com',
					countryCode: '+52',
					phoneNumber: '5598765432',
				}],
				notificationSettings: { sendInvitations: true },
				signatureValidations: {},
			});

			await node.execute.call(fn);
			const body = mockHttpRequest.mock.calls[1][0].body;

			expect(body.participants).toEqual([{
				name: 'Maria',
				email: 'maria@test.com',
				whatsapp: '+525598765432',
			}]);
		});

		it('should throw when signer has neither email nor phone', async () => {
			const pdfBuffer = Buffer.from('pdf');
			mockHttpRequest.mockResolvedValueOnce(pdfBuffer);

			const fn = getMockExecuteFunctions({
				documentName: 'Invalid Signer',
				fileSource: 'url',
				fileUrl: 'https://example.com/doc.pdf',
				'signers.signerValues': [{
					name: 'NoContact',
					email: '',
					phoneNumber: '',
				}],
				notificationSettings: { sendInvitations: true },
				signatureValidations: {},
			});

			await expect(node.execute.call(fn)).rejects.toThrow(
				'Signer "NoContact" must have at least an email address or a WhatsApp phone number',
			);
		});

		it('should handle invite-bulk with phone-only participants', async () => {
			const pdfBuffer = Buffer.from('pdf');
			mockHttpRequest.mockResolvedValueOnce(pdfBuffer);
			mockHttpRequest.mockResolvedValueOnce({ id: 'doc-invite-phone' });
			mockHttpRequest.mockResolvedValueOnce({ invited: 1 });

			const fn = getMockExecuteFunctions({
				documentName: 'Invite Phone Doc',
				fileSource: 'url',
				fileUrl: 'https://example.com/doc.pdf',
				'signers.signerValues': [{
					name: 'Luis',
					email: '',
					countryCode: '+1',
					phoneNumber: '2125551234',
				}],
				notificationSettings: { sendInvitations: true },
				signatureValidations: {},
			});

			await node.execute.call(fn);
			const inviteCall = mockHttpRequest.mock.calls[2][0];
			const inviteBody = inviteCall.body;

			expect(inviteBody.participants[0]).toEqual({
				name: 'Luis',
				whatsapp: '+12125551234',
			});
			expect(inviteBody.participants[0]).not.toHaveProperty('email');
		});
	});

	// ----------------------------------------------------------
	// Signature Validation (V2 Schema)
	// ----------------------------------------------------------
	describe('Signature Validation', () => {
		it('should map video to videofirma and biometric to biometric_signature', async () => {
			const pdfBuffer = Buffer.from('pdf');
			mockHttpRequest.mockResolvedValueOnce(pdfBuffer);
			mockHttpRequest.mockResolvedValueOnce({ id: 'doc-mapping' });

			const fn = getMockExecuteFunctions({
				documentName: 'Mapping Doc',
				fileSource: 'url',
				fileUrl: 'https://example.com/doc.pdf',
				'signers.signerValues': [{ name: 'Test', email: 'test@test.com' }],
				notificationSettings: { sendInvitations: true },
				signatureValidations: {
					verifyVideo: true,
					verifyBiometricSelfie: true,
				},
			});

			await node.execute.call(fn);
			const body = mockHttpRequest.mock.calls[1][0].body;
			expect(body.signatureValidation.videofirma).toBe(true);
			expect(body.signatureValidation.biometric_signature).toBe(true);
			expect(body.signatureValidation).not.toHaveProperty('biometric_signature_wrong');
		});

		it('should set all validation fields correctly', async () => {
			const pdfBuffer = Buffer.from('pdf');
			mockHttpRequest.mockResolvedValueOnce(pdfBuffer);
			mockHttpRequest.mockResolvedValueOnce({ id: 'doc-ver' });

			const fn = getMockExecuteFunctions({
				documentName: 'Verified Doc',
				fileSource: 'url',
				fileUrl: 'https://example.com/doc.pdf',
				'signers.signerValues': [{ name: 'Test', email: 'test@test.com' }],
				notificationSettings: { sendInvitations: true },
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
			const body = mockHttpRequest.mock.calls[1][0].body;
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
			mockHttpRequest.mockResolvedValueOnce({ id: 'doc-id' });

			const fn = getMockExecuteFunctions({
				documentName: 'Identity Doc',
				fileSource: 'url',
				fileUrl: 'https://example.com/doc.pdf',
				'signers.signerValues': [{ name: 'Test', email: 'test@test.com' }],
				notificationSettings: { sendInvitations: true },
				signatureValidations: {
					verifyIdentity: true,
					verifyIdScan: true,
					verifyBiometricSelfie: true,
					verifySynthId: true,
				},
			});

			await node.execute.call(fn);
			const body = mockHttpRequest.mock.calls[1][0].body;
			expect(body.signatureValidation.ai_verification).toBe(true);
			expect(body.signatureValidation.id_scan).toBe(true);
			expect(body.signatureValidation.biometric_signature).toBe(true);
		});

		it('should not include ai_verification when identity is disabled', async () => {
			const pdfBuffer = Buffer.from('pdf');
			mockHttpRequest.mockResolvedValueOnce(pdfBuffer);
			mockHttpRequest.mockResolvedValueOnce({ id: 'doc-noid' });

			const fn = getMockExecuteFunctions({
				documentName: 'No Identity Doc',
				fileSource: 'url',
				fileUrl: 'https://example.com/doc.pdf',
				'signers.signerValues': [{ name: 'Test', email: 'test@test.com' }],
				notificationSettings: { sendInvitations: true },
				signatureValidations: {},
			});

			await node.execute.call(fn);
			const body = mockHttpRequest.mock.calls[1][0].body;
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
			mockHttpRequest.mockResolvedValueOnce({ id: 'doc-template' });

			const fn = getMockExecuteFunctions({
				documentName: 'Template Doc',
				fileSource: 'url',
				fileUrl: 'https://example.com/template.docx',
				'signers.signerValues': [],
				notificationSettings: { sendInvitations: false },
				signatureValidations: {},
				additionalOptions: {
					templateVariables: '{"client_name": "Juan", "amount": "$10,000"}',
				},
			});

			await node.execute.call(fn);
			const body = mockHttpRequest.mock.calls[1][0].body;
			expect(body.template).toEqual({
				variables: { client_name: 'Juan', amount: '$10,000' },
			});
		});

		it('should not include template when empty', async () => {
			const pdfBuffer = Buffer.from('pdf');
			mockHttpRequest.mockResolvedValueOnce(pdfBuffer);
			mockHttpRequest.mockResolvedValueOnce({ id: 'doc-no-tmpl' });

			const fn = getMockExecuteFunctions({
				documentName: 'No Template',
				fileSource: 'url',
				fileUrl: 'https://example.com/doc.pdf',
				'signers.signerValues': [],
				notificationSettings: { sendInvitations: false },
				signatureValidations: {},
			});

			await node.execute.call(fn);
			const body = mockHttpRequest.mock.calls[1][0].body;
			expect(body).not.toHaveProperty('template');
		});

		it('should include expiresAt in config when provided', async () => {
			const pdfBuffer = Buffer.from('pdf');
			mockHttpRequest.mockResolvedValueOnce(pdfBuffer);
			mockHttpRequest.mockResolvedValueOnce({ id: 'doc-expires' });

			const fn = getMockExecuteFunctions({
				documentName: 'Expiring Doc',
				fileSource: 'url',
				fileUrl: 'https://example.com/doc.pdf',
				'signers.signerValues': [],
				notificationSettings: { sendInvitations: false },
				signatureValidations: {},
				additionalOptions: {
					expiresAt: '2026-04-01T00:00:00Z',
				},
			});

			await node.execute.call(fn);
			const body = mockHttpRequest.mock.calls[1][0].body;
			expect(body.config.expiresAt).toBe('2026-04-01T00:00:00Z');
		});

		it('should use folderId over folderName when both provided', async () => {
			const pdfBuffer = Buffer.from('pdf');
			mockHttpRequest.mockResolvedValueOnce(pdfBuffer);
			mockHttpRequest.mockResolvedValueOnce({ id: 'doc-folder' });

			const fn = getMockExecuteFunctions({
				documentName: 'Folder Doc',
				fileSource: 'url',
				fileUrl: 'https://example.com/doc.pdf',
				'signers.signerValues': [],
				notificationSettings: { sendInvitations: false },
				signatureValidations: {},
				additionalOptions: {
					folderId: 'folder-uuid-123',
					folderName: 'Contracts',
				},
			});

			await node.execute.call(fn);
			const body = mockHttpRequest.mock.calls[1][0].body;
			expect(body.folderId).toBe('folder-uuid-123');
			expect(body).not.toHaveProperty('folderName');
		});

		it('should include permissions when provided', async () => {
			const pdfBuffer = Buffer.from('pdf');
			mockHttpRequest.mockResolvedValueOnce(pdfBuffer);
			mockHttpRequest.mockResolvedValueOnce({ id: 'doc-perms' });

			const fn = getMockExecuteFunctions({
				documentName: 'Perms Doc',
				fileSource: 'url',
				fileUrl: 'https://example.com/doc.pdf',
				'signers.signerValues': [],
				notificationSettings: { sendInvitations: false },
				signatureValidations: {},
				permissions: {
					ownerEmail: 'legal@company.com',
					collaborators: '[{"email": "cfo@company.com", "permissions": ["read", "sign"]}]',
					isPublicRead: false,
				},
			});

			await node.execute.call(fn);
			const body = mockHttpRequest.mock.calls[1][0].body;
			expect(body.permissions).toEqual({
				ownerEmail: 'legal@company.com',
				collaborators: [{ email: 'cfo@company.com', permissions: ['read', 'sign'] }],
			});
		});

		it('should not include permissions when empty', async () => {
			const pdfBuffer = Buffer.from('pdf');
			mockHttpRequest.mockResolvedValueOnce(pdfBuffer);
			mockHttpRequest.mockResolvedValueOnce({ id: 'doc-no-perms' });

			const fn = getMockExecuteFunctions({
				documentName: 'No Perms',
				fileSource: 'url',
				fileUrl: 'https://example.com/doc.pdf',
				'signers.signerValues': [],
				notificationSettings: { sendInvitations: false },
				signatureValidations: {},
			});

			await node.execute.call(fn);
			const body = mockHttpRequest.mock.calls[1][0].body;
			expect(body).not.toHaveProperty('permissions');
		});
	});

	// ----------------------------------------------------------
	// Multiple Signers
	// ----------------------------------------------------------
	describe('Multiple Signers', () => {
		it('should send multiple participants in one request', async () => {
			const pdfBuffer = Buffer.from('pdf');
			mockHttpRequest.mockResolvedValueOnce(pdfBuffer);
			mockHttpRequest.mockResolvedValueOnce({ id: 'doc-multi', name: 'Multi-Signer' });
			mockHttpRequest.mockResolvedValueOnce({ invited: 3 });

			const fn = getMockExecuteFunctions({
				documentName: 'Multi-Signer Doc',
				fileSource: 'url',
				fileUrl: 'https://example.com/doc.pdf',
				'signers.signerValues': [
					{ name: 'Alice', email: 'alice@test.com' },
					{ name: 'Bob', email: 'bob@test.com' },
					{ name: 'Charlie', email: 'charlie@test.com' },
				],
				notificationSettings: { sendInvitations: true },
				signatureValidations: {},
			});

			await node.execute.call(fn);
			const body = mockHttpRequest.mock.calls[1][0].body;
			expect(body.participants).toHaveLength(3);
			expect(body.participants).toEqual([
				{ name: 'Alice', email: 'alice@test.com' },
				{ name: 'Bob', email: 'bob@test.com' },
				{ name: 'Charlie', email: 'charlie@test.com' },
			]);
			expect(body.config.sendInvitations).toBe(false);
			expect(body.config.startAtStep).toBe(2);

			expect(mockHttpRequest).toHaveBeenCalledTimes(3);
			const inviteCall = mockHttpRequest.mock.calls[2][0];
			expect(inviteCall.method).toBe('POST');
			expect(inviteCall.url).toBe('https://api.allsign.io/v2/documents/doc-multi/invite-bulk');
		});
	});

	// ----------------------------------------------------------
	// Auth Headers
	// ----------------------------------------------------------
	describe('Auth Headers', () => {
		it('should include Authorization Bearer header in all requests', async () => {
			const pdfBuffer = Buffer.from('pdf');
			mockHttpRequest.mockResolvedValueOnce(pdfBuffer);
			mockHttpRequest.mockResolvedValueOnce({ success: true });

			const fn = getMockExecuteFunctions({
				documentName: 'Auth Test',
				fileSource: 'url',
				fileUrl: 'https://example.com/doc.pdf',
				'signers.signerValues': [{ name: 'Test', email: 'test@test.com' }],
				notificationSettings: { sendInvitations: true },
				signatureValidations: {},
			});

			await node.execute.call(fn);
			expect(mockHttpRequest.mock.calls[1][0].headers).toEqual({
				Authorization: 'Bearer allsign_live_sk_test123',
			});
		});
	});

	// ----------------------------------------------------------
	// Base URL Handling
	// ----------------------------------------------------------
	describe('Base URL Handling', () => {
		it('should strip trailing slashes from base URL', async () => {
			const pdfBuffer = Buffer.from('pdf');
			mockHttpRequest.mockResolvedValueOnce(pdfBuffer);
			mockHttpRequest.mockResolvedValueOnce({ success: true });

			const fn = getMockExecuteFunctions({
				documentName: 'Slash Test',
				fileSource: 'url',
				fileUrl: 'https://example.com/doc.pdf',
				'signers.signerValues': [{ name: 'Test', email: 'test@test.com' }],
				notificationSettings: { sendInvitations: true },
				signatureValidations: {},
			});
			(fn as any).getCredentials = async () => ({
				apiKey: 'allsign_live_sk_test123',
				baseUrl: 'https://api.allsign.io/',
			});

			await node.execute.call(fn);
			expect(mockHttpRequest.mock.calls[1][0].url).toBe('https://api.allsign.io/v2/documents/');
		});

		it('should use custom base URL for dev environments', async () => {
			const pdfBuffer = Buffer.from('pdf');
			mockHttpRequest.mockResolvedValueOnce(pdfBuffer);
			mockHttpRequest.mockResolvedValueOnce({ id: 'doc-dev' });

			const fn = getMockExecuteFunctions({
				documentName: 'Dev Doc',
				fileSource: 'url',
				fileUrl: 'https://example.com/doc.pdf',
				'signers.signerValues': [{ name: 'Test', email: 'test@test.com' }],
				notificationSettings: { sendInvitations: true },
				signatureValidations: {},
			});
			(fn as any).getCredentials = async () => ({
				apiKey: 'allsign_trial_sk_dev456',
				baseUrl: 'http://localhost:8000',
			});

			await node.execute.call(fn);
			expect(mockHttpRequest.mock.calls[1][0].url).toBe('http://localhost:8000/v2/documents/');
		});
	});

	// ----------------------------------------------------------
	// Error Handling
	// ----------------------------------------------------------
	describe('Error Handling', () => {
		it('should throw NodeOperationError on API failure', async () => {
			mockHttpRequest.mockResolvedValueOnce(Buffer.from('pdf'));
			mockHttpRequest.mockRejectedValueOnce({
				response: { data: { message: 'Insufficient credits' }, status: 402 },
			});

			const fn = getMockExecuteFunctions({
				documentName: 'Error Doc',
				fileSource: 'url',
				fileUrl: 'https://example.com/doc.pdf',
				'signers.signerValues': [{ name: 'Test', email: 'test@test.com' }],
				notificationSettings: { sendInvitations: true },
				signatureValidations: {},
			});

			await expect(node.execute.call(fn)).rejects.toThrow('AllSign API Error: Insufficient credits');
		});

		it('should throw when file download fails', async () => {
			mockHttpRequest.mockRejectedValueOnce(new Error('File not found'));

			const fn = getMockExecuteFunctions({
				documentName: 'Bad URL Doc',
				fileSource: 'url',
				fileUrl: 'https://example.com/nonexistent.pdf',
				'signers.signerValues': [{ name: 'Test', email: 'test@test.com' }],
				notificationSettings: { sendInvitations: true },
				signatureValidations: {},
			});

			await expect(node.execute.call(fn)).rejects.toThrow('AllSign API Error');
		});

		it('should continue on fail when enabled', async () => {
			mockHttpRequest.mockRejectedValueOnce(new Error('Connection refused'));

			const fn = getMockExecuteFunctions({
				documentName: 'Fail Doc',
				fileSource: 'url',
				fileUrl: 'https://example.com/doc.pdf',
				'signers.signerValues': [],
				notificationSettings: { sendInvitations: false },
				signatureValidations: {},
			});
			(fn as any).continueOnFail = () => true;

			const result = await node.execute.call(fn);
			expect(result[0][0].json).toHaveProperty('error', 'Connection refused');
		});
	});
});
