import type { IExecuteFunctions } from 'n8n-workflow';
import { Allsign } from './Allsign.node';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type NodeProp = Record<string, any>;

const UUID_V4_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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
describe('AllSign Node (API v3 — Create Document + Send Document)', () => {
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

		it('should NOT have a resource property (single-resource node: Document)', () => {
			const resourceProp = node.description.properties.find((p) => p.name === 'resource');
			expect(resourceProp).toBeUndefined();
		});

		it('should have an Operation selector with Create Document and Send Document', () => {
			const operationProp = node.description.properties.find((p) => p.name === 'operation');
			expect(operationProp).toBeDefined();
			expect((operationProp as NodeProp).type).toBe('options');
			expect((operationProp as NodeProp).default).toBe('createDocument');
			const values = (operationProp as NodeProp).options!.map((o: NodeProp) => o.value);
			expect(values).toEqual(['createDocument', 'sendDocument']);
		});

		it('should have a Source selector with File and Template options', () => {
			const source = node.description.properties.find((p) => p.name === 'source');
			expect(source).toBeDefined();
			expect((source as NodeProp).type).toBe('options');
			expect((source as NodeProp).default).toBe('file');
			const values = (source as NodeProp).options!.map((o: NodeProp) => o.value);
			expect(values).toEqual(['file', 'template']);
		});

		it('should have templateId and templateValues fields shown only for Source = Template', () => {
			const templateId = node.description.properties.find((p) => p.name === 'templateId');
			const templateValues = node.description.properties.find((p) => p.name === 'templateValues');
			expect(templateId).toBeDefined();
			expect((templateId as NodeProp).displayOptions.show.source).toEqual(['template']);
			expect(templateValues).toBeDefined();
			expect((templateValues as NodeProp).displayOptions.show.source).toEqual(['template']);
		});

		it('should have fileSource shown only for Source = File', () => {
			const fileSourceProp = node.description.properties.find((p) => p.name === 'fileSource');
			expect((fileSourceProp as NodeProp).displayOptions.show.source).toEqual(['file']);
			const fileSourceOptions = (fileSourceProp as NodeProp).options!.map((o: NodeProp) => o.value);
			expect(fileSourceOptions).toContain('binary');
			expect(fileSourceOptions).toContain('url');
		});

		it('should NOT have Signature Fields, Permissions, or Folder sections (not in v3 create body)', () => {
			const fields = node.description.properties.find((p) => p.name === 'signatureFields');
			const permissions = node.description.properties.find((p) => p.name === 'permissions');
			const folder = node.description.properties.find((p) => p.name === 'folderSettings');
			expect(fields).toBeUndefined();
			expect(permissions).toBeUndefined();
			expect(folder).toBeUndefined();
		});

		it('should have a collapsible Configuration collection with Expires At and Idempotency Key', () => {
			const config = node.description.properties.find((p) => p.name === 'configuration');
			expect(config).toBeDefined();
			expect((config as NodeProp).type).toBe('collection');
			const optNames = (config as NodeProp).options!.map((o: NodeProp) => o.name);
			expect(optNames).toEqual(['expiresAt', 'idempotencyKey']);
		});

		it('should have codex aliases for discoverability including WhatsApp, without eIDAS', () => {
			const aliases = node.description.codex?.alias || [];
			expect(aliases).toContain('Signature');
			expect(aliases).toContain('PDF');
			expect(aliases).toContain('NOM-151');
			expect(aliases).toContain('FEA');
			expect(aliases).toContain('WhatsApp');
			expect(aliases).not.toContain('eIDAS');
			// Spanish aliases should NOT be present
			expect(aliases).not.toContain('Firma');
			expect(aliases).not.toContain('Documento');
			expect(aliases).not.toContain('Firmante');
		});

		it('should be usable as a tool', () => {
			expect(node.description.usableAsTool).toBe(true);
		});

		it('should have exactly the 6 curated v3 Signature Validations, no more', () => {
			const sigValidations = node.description.properties.find(
				(p) => p.name === 'signatureValidations',
			);
			const sigOptions = (sigValidations as NodeProp).options.map((o: NodeProp) => o.name);
			expect(sigOptions.sort()).toEqual(
				[
					'verifyAutografa',
					'verifyNom151',
					'verifyFea',
					'verifyBiometricSelfie',
					'verifyIdScan',
					'verifyVideo',
				].sort(),
			);
			expect(sigOptions).not.toContain('verifyEidas');
			expect(sigOptions).not.toContain('verifyConfirmName');
			expect(sigOptions).not.toContain('verifyIdentity');
			expect(sigOptions).not.toContain('verifySynthId');
		});

		it('should have deliveryMethod dropdown and roleName in signers', () => {
			const signers = node.description.properties.find((p) => p.name === 'signers');
			const signerFields = (signers as NodeProp).options![0].values!;
			const methodField = signerFields.find((f: NodeProp) => f.name === 'deliveryMethod');
			expect(methodField).toBeDefined();
			expect(methodField.type).toBe('options');
			const optionValues = methodField.options.map((o: NodeProp) => o.value);
			expect(optionValues).toContain('email');
			expect(optionValues).toContain('whatsapp');

			const roleNameField = signerFields.find((f: NodeProp) => f.name === 'roleName');
			expect(roleNameField).toBeDefined();
			expect(roleNameField.type).toBe('string');
		});
	});

	// ----------------------------------------------------------
	// Create Document (File, URL) — v3 single-call schema
	// ----------------------------------------------------------
	describe('Create Document (File, URL)', () => {
		it('should POST a single v3 request with signers + signatureValidation inline', async () => {
			const pdfBuffer = Buffer.from('fake-pdf-content');
			mockHttpRequest.mockResolvedValueOnce(pdfBuffer); // download PDF (no auth)
			mockHttpRequestWithAuthentication.mockResolvedValueOnce({
				id: 'doc_123',
				object: 'document',
				name: 'Test Contract',
				status: 'awaiting_signatures',
			});

			const fn = getMockExecuteFunctions({
				documentName: 'Test Contract',
				source: 'file',
				fileSource: 'url',
				fileUrl: 'https://example.com/contract.pdf',
				'signers.signerValues': [{ name: 'John', deliveryMethod: 'email', email: 'john@test.com' }],
				signatureValidations: { verifyAutografa: true },
			});

			const result = await node.execute.call(fn);

			// 1: download PDF (no auth — uses httpRequest)
			expect(mockHttpRequest).toHaveBeenCalledTimes(1);
			expect(mockHttpRequest).toHaveBeenNthCalledWith(1, expect.objectContaining({
				method: 'GET',
				url: 'https://example.com/contract.pdf',
			}));

			// 2: ONE call to create the document — no add-signer/signature-fields/invite-bulk
			expect(mockHttpRequestWithAuthentication).toHaveBeenCalledTimes(1);

			const call = mockHttpRequestWithAuthentication.mock.calls[0][1];
			expect(call.method).toBe('POST');
			expect(call.url).toBe('https://api.allsign.io/v3/documents');

			const body = call.body;
			expect(body.source).toBe('file');
			expect(body.name).toBe('Test Contract');
			expect(body.file).toEqual({
				content: pdfBuffer.toString('base64'),
				fileType: 'pdf',
				name: 'contract.pdf',
			});
			expect(body.signers).toEqual([{ name: 'John', email: 'john@test.com' }]);
			expect(body.signatureValidation).toEqual({
				autografa: true,
				nom151: false,
				fea: false,
				biometricSignature: false,
				idScan: false,
				videofirma: false,
			});
			expect(body.templateId).toBeUndefined();
			expect(body.templateValues).toBeUndefined();

			expect(result[0][0].json).toEqual(
				expect.objectContaining({ id: 'doc_123', name: 'Test Contract', status: 'awaiting_signatures' }),
			);
		});

		it('should default autografa to true when signatureValidations is empty', async () => {
			const pdfBuffer = Buffer.from('simple-pdf');
			mockHttpRequest.mockResolvedValueOnce(pdfBuffer);
			mockHttpRequestWithAuthentication.mockResolvedValueOnce({ id: 'doc_456' });

			const fn = getMockExecuteFunctions({
				documentName: 'Simple Doc',
				source: 'file',
				fileSource: 'url',
				fileUrl: 'https://example.com/simple.pdf',
				'signers.signerValues': [{ name: 'Jane', deliveryMethod: 'email', email: 'jane@test.com' }],
				signatureValidations: {},
			});

			await node.execute.call(fn);
			const body = mockHttpRequestWithAuthentication.mock.calls[0][1].body;

			expect(body.signatureValidation.autografa).toBe(true);
		});

		it('should not include signers when no signers provided', async () => {
			const pdfBuffer = Buffer.from('draft-pdf');
			mockHttpRequest.mockResolvedValueOnce(pdfBuffer);
			mockHttpRequestWithAuthentication.mockResolvedValueOnce({ id: 'doc_draft' });

			const fn = getMockExecuteFunctions({
				documentName: 'Draft Doc',
				source: 'file',
				fileSource: 'url',
				fileUrl: 'https://example.com/draft.pdf',
				'signers.signerValues': [],
				signatureValidations: {},
			});

			await node.execute.call(fn);
			const body = mockHttpRequestWithAuthentication.mock.calls[0][1].body;
			expect(body.signers).toBeUndefined();
		});

		it('should infer fileType docx from a .docx filename', async () => {
			const docxBuffer = Buffer.from('docx-content');
			mockHttpRequest.mockResolvedValueOnce(docxBuffer);
			mockHttpRequestWithAuthentication.mockResolvedValueOnce({ id: 'doc_docx' });

			const fn = getMockExecuteFunctions({
				documentName: 'NDA',
				source: 'file',
				fileSource: 'url',
				fileUrl: 'https://example.com/nda.docx',
				'signers.signerValues': [],
				signatureValidations: {},
			});

			await node.execute.call(fn);
			const body = mockHttpRequestWithAuthentication.mock.calls[0][1].body;
			expect(body.file.fileType).toBe('docx');
			expect(body.file.name).toBe('nda.docx');
		});
	});

	// ----------------------------------------------------------
	// Create Document (Binary)
	// ----------------------------------------------------------
	describe('Create Document (Binary)', () => {
		it('should use binary data and POST a single v3 request', async () => {
			const binaryBuffer = Buffer.from('binary-pdf-content');
			mockAssertBinaryData.mockReturnValueOnce({ fileName: 'contract.pdf' });
			mockGetBinaryDataBuffer.mockResolvedValueOnce(binaryBuffer);
			mockHttpRequestWithAuthentication.mockResolvedValueOnce({ id: 'doc_bin', name: 'Binary Upload' });

			const fn = getMockExecuteFunctions({
				documentName: 'Binary Upload',
				source: 'file',
				fileSource: 'binary',
				binaryProperty: 'data',
				'signers.signerValues': [{ name: 'Bob', deliveryMethod: 'email', email: 'bob@test.com' }],
				signatureValidations: {},
			});

			const result = await node.execute.call(fn);

			expect(mockHttpRequestWithAuthentication).toHaveBeenCalledTimes(1);

			const call = mockHttpRequestWithAuthentication.mock.calls[0][1];
			expect(call.method).toBe('POST');
			expect(call.url).toBe('https://api.allsign.io/v3/documents');
			expect(call.body.file).toEqual({
				content: binaryBuffer.toString('base64'),
				fileType: 'pdf',
				name: 'contract.pdf',
			});
			expect(call.body.signers).toEqual([{ name: 'Bob', email: 'bob@test.com' }]);

			expect(result[0][0].json).toEqual(expect.objectContaining({ id: 'doc_bin', name: 'Binary Upload' }));
		});

		it('should use documentName.pdf when binary has no fileName', async () => {
			const binaryBuffer = Buffer.from('content');
			mockAssertBinaryData.mockReturnValueOnce({ fileName: undefined });
			mockGetBinaryDataBuffer.mockResolvedValueOnce(binaryBuffer);
			mockHttpRequestWithAuthentication.mockResolvedValueOnce({ id: 'doc_noname' });

			const fn = getMockExecuteFunctions({
				documentName: 'Unnamed Doc',
				source: 'file',
				fileSource: 'binary',
				binaryProperty: 'data',
				'signers.signerValues': [],
				signatureValidations: {},
			});

			await node.execute.call(fn);
			const body = mockHttpRequestWithAuthentication.mock.calls[0][1].body;
			expect(body.file.name).toBe('document.pdf');
		});
	});

	// ----------------------------------------------------------
	// Create Document (Template)
	// ----------------------------------------------------------
	describe('Create Document (Template)', () => {
		it('should send source=template with templateId and templateValues, no file', async () => {
			mockHttpRequestWithAuthentication.mockResolvedValueOnce({ id: 'doc_tmpl' });

			const fn = getMockExecuteFunctions({
				documentName: 'NDA from Template',
				source: 'template',
				templateId: 'tmpl_abc123',
				templateValues: '{"nombre_completo": "Juan Perez", "monto": "$10,000"}',
				'signers.signerValues': [{ name: 'Juan', deliveryMethod: 'email', email: 'juan@test.com', roleName: 'cliente' }],
				signatureValidations: {},
			});

			await node.execute.call(fn);

			expect(mockHttpRequest).not.toHaveBeenCalled();
			expect(mockHttpRequestWithAuthentication).toHaveBeenCalledTimes(1);

			const body = mockHttpRequestWithAuthentication.mock.calls[0][1].body;
			expect(body.source).toBe('template');
			expect(body.templateId).toBe('tmpl_abc123');
			expect(body.templateValues).toEqual({ nombre_completo: 'Juan Perez', monto: '$10,000' });
			expect(body.file).toBeUndefined();
			expect(body.signers).toEqual([{ name: 'Juan', email: 'juan@test.com', roleName: 'cliente' }]);
		});

		it('should not include templateValues when empty', async () => {
			mockHttpRequestWithAuthentication.mockResolvedValueOnce({ id: 'doc_tmpl_empty' });

			const fn = getMockExecuteFunctions({
				documentName: 'Empty Values',
				source: 'template',
				templateId: 'tmpl_xyz',
				templateValues: '{}',
				'signers.signerValues': [],
				signatureValidations: {},
			});

			await node.execute.call(fn);
			const body = mockHttpRequestWithAuthentication.mock.calls[0][1].body;
			expect(body).not.toHaveProperty('templateValues');
		});

		it('should throw when Template ID is missing', async () => {
			const fn = getMockExecuteFunctions({
				documentName: 'No Template ID',
				source: 'template',
				templateId: '',
				'signers.signerValues': [],
				signatureValidations: {},
			});

			await expect(node.execute.call(fn)).rejects.toThrow(
				'Template ID is required when Source is Template',
			);
		});

		it('should throw on invalid JSON in Template Values', async () => {
			const fn = getMockExecuteFunctions({
				documentName: 'Bad JSON',
				source: 'template',
				templateId: 'tmpl_abc',
				templateValues: '{not valid json',
				'signers.signerValues': [],
				signatureValidations: {},
			});

			await expect(node.execute.call(fn)).rejects.toThrow('Invalid JSON in Template Values');
		});
	});

	// ----------------------------------------------------------
	// Phone-Only Signers (WhatsApp) + Role Name
	// ----------------------------------------------------------
	describe('Signers', () => {
		it('should create a signer with only phone (no email) for WhatsApp delivery', async () => {
			const pdfBuffer = Buffer.from('pdf');
			mockHttpRequest.mockResolvedValueOnce(pdfBuffer);
			mockHttpRequestWithAuthentication.mockResolvedValueOnce({ id: 'doc_phone' });

			const fn = getMockExecuteFunctions({
				documentName: 'Phone Signer Doc',
				source: 'file',
				fileSource: 'url',
				fileUrl: 'https://example.com/doc.pdf',
				'signers.signerValues': [{
					name: 'Carlos',
					deliveryMethod: 'whatsapp',
					whatsapp: '+525512345678',
				}],
				signatureValidations: {},
			});

			await node.execute.call(fn);

			const body = mockHttpRequestWithAuthentication.mock.calls[0][1].body;
			expect(body.signers).toEqual([{ name: 'Carlos', phone: '+525512345678' }]);
		});

		it('should include roleName only when provided', async () => {
			const pdfBuffer = Buffer.from('pdf');
			mockHttpRequest.mockResolvedValueOnce(pdfBuffer);
			mockHttpRequestWithAuthentication.mockResolvedValueOnce({ id: 'doc_role' });

			const fn = getMockExecuteFunctions({
				documentName: 'Role Doc',
				source: 'file',
				fileSource: 'url',
				fileUrl: 'https://example.com/doc.pdf',
				'signers.signerValues': [
					{ name: 'Maria', deliveryMethod: 'email', email: 'maria@test.com', roleName: 'proveedor' },
					{ name: 'Luis', deliveryMethod: 'email', email: 'luis@test.com' },
				],
				signatureValidations: {},
			});

			await node.execute.call(fn);
			const body = mockHttpRequestWithAuthentication.mock.calls[0][1].body;
			expect(body.signers[0]).toEqual({ name: 'Maria', email: 'maria@test.com', roleName: 'proveedor' });
			expect(body.signers[1]).toEqual({ name: 'Luis', email: 'luis@test.com' });
			expect(body.signers[1]).not.toHaveProperty('roleName');
		});

		it('should throw when email delivery method has no email', async () => {
			// Signer validation happens before the file is fetched — no download mock needed.
			const fn = getMockExecuteFunctions({
				documentName: 'Invalid Signer',
				source: 'file',
				fileSource: 'url',
				fileUrl: 'https://example.com/doc.pdf',
				'signers.signerValues': [{
					name: 'NoEmail',
					deliveryMethod: 'email',
					email: '',
				}],
				signatureValidations: {},
			});

			await expect(node.execute.call(fn)).rejects.toThrow(
				'Signer "NoEmail" has Email as delivery method but no email address was provided',
			);
		});

		it('should throw when WhatsApp delivery method has no number', async () => {
			// Signer validation happens before the file is fetched — no download mock needed.
			const fn = getMockExecuteFunctions({
				documentName: 'Invalid Signer',
				source: 'file',
				fileSource: 'url',
				fileUrl: 'https://example.com/doc.pdf',
				'signers.signerValues': [{
					name: 'NoPhone',
					deliveryMethod: 'whatsapp',
					whatsapp: '',
				}],
				signatureValidations: {},
			});

			await expect(node.execute.call(fn)).rejects.toThrow(
				'Signer "NoPhone" has WhatsApp as delivery method but no WhatsApp number was provided',
			);
		});
	});

	// ----------------------------------------------------------
	// Signature Validation (v3 curated 6-flag schema)
	// ----------------------------------------------------------
	describe('Signature Validation', () => {
		it('should map verifyVideo -> videofirma and verifyBiometricSelfie -> biometricSignature', async () => {
			const pdfBuffer = Buffer.from('pdf');
			mockHttpRequest.mockResolvedValueOnce(pdfBuffer);
			mockHttpRequestWithAuthentication.mockResolvedValueOnce({ id: 'doc_mapping' });

			const fn = getMockExecuteFunctions({
				documentName: 'Mapping Doc',
				source: 'file',
				fileSource: 'url',
				fileUrl: 'https://example.com/doc.pdf',
				'signers.signerValues': [{ name: 'Test', deliveryMethod: 'email', email: 'test@test.com' }],
				signatureValidations: {
					verifyVideo: true,
					verifyBiometricSelfie: true,
				},
			});

			await node.execute.call(fn);
			const body = mockHttpRequestWithAuthentication.mock.calls[0][1].body;
			expect(body.signatureValidation.videofirma).toBe(true);
			expect(body.signatureValidation.biometricSignature).toBe(true);
		});

		it('should set all 6 validation fields correctly', async () => {
			const pdfBuffer = Buffer.from('pdf');
			mockHttpRequest.mockResolvedValueOnce(pdfBuffer);
			mockHttpRequestWithAuthentication.mockResolvedValueOnce({ id: 'doc_ver' });

			const fn = getMockExecuteFunctions({
				documentName: 'Verified Doc',
				source: 'file',
				fileSource: 'url',
				fileUrl: 'https://example.com/doc.pdf',
				'signers.signerValues': [{ name: 'Test', deliveryMethod: 'email', email: 'test@test.com' }],
				signatureValidations: {
					verifyAutografa: true,
					verifyFea: true,
					verifyNom151: true,
					verifyIdScan: true,
					verifyBiometricSelfie: true,
					verifyVideo: true,
				},
			});

			await node.execute.call(fn);
			const body = mockHttpRequestWithAuthentication.mock.calls[0][1].body;
			expect(body.signatureValidation).toEqual({
				autografa: true,
				fea: true,
				nom151: true,
				idScan: true,
				biometricSignature: true,
				videofirma: true,
			});
		});
	});

	// ----------------------------------------------------------
	// Expires At + Idempotency Key
	// ----------------------------------------------------------
	describe('Configuration', () => {
		it('should include expiresAt in the body when provided', async () => {
			const pdfBuffer = Buffer.from('pdf');
			mockHttpRequest.mockResolvedValueOnce(pdfBuffer);
			mockHttpRequestWithAuthentication.mockResolvedValueOnce({ id: 'doc_expires' });

			const fn = getMockExecuteFunctions({
				documentName: 'Expiring Doc',
				source: 'file',
				fileSource: 'url',
				fileUrl: 'https://example.com/doc.pdf',
				'signers.signerValues': [],
				signatureValidations: {},
				configuration: { expiresAt: '2026-04-01T00:00:00Z' },
			});

			await node.execute.call(fn);
			const body = mockHttpRequestWithAuthentication.mock.calls[0][1].body;
			expect(body.expiresAt).toBe('2026-04-01T00:00:00Z');
		});

		it('should not include expiresAt when omitted', async () => {
			const pdfBuffer = Buffer.from('pdf');
			mockHttpRequest.mockResolvedValueOnce(pdfBuffer);
			mockHttpRequestWithAuthentication.mockResolvedValueOnce({ id: 'doc_no_expires' });

			const fn = getMockExecuteFunctions({
				documentName: 'No Expiry Doc',
				source: 'file',
				fileSource: 'url',
				fileUrl: 'https://example.com/doc.pdf',
				'signers.signerValues': [],
				signatureValidations: {},
				configuration: {},
			});

			await node.execute.call(fn);
			const body = mockHttpRequestWithAuthentication.mock.calls[0][1].body;
			expect(body).not.toHaveProperty('expiresAt');
		});

		it('should send Idempotency-Key header when provided', async () => {
			const pdfBuffer = Buffer.from('pdf');
			mockHttpRequest.mockResolvedValueOnce(pdfBuffer);
			mockHttpRequestWithAuthentication.mockResolvedValueOnce({ id: 'doc_idem' });

			const fn = getMockExecuteFunctions({
				documentName: 'Idempotent Doc',
				source: 'file',
				fileSource: 'url',
				fileUrl: 'https://example.com/doc.pdf',
				'signers.signerValues': [],
				signatureValidations: {},
				configuration: { idempotencyKey: 'order-4821-create' },
			});

			await node.execute.call(fn);
			const requestOptions = mockHttpRequestWithAuthentication.mock.calls[0][1];
			expect(requestOptions.headers).toEqual({ 'Idempotency-Key': 'order-4821-create' });
		});

		it('should auto-generate a UUID v4 Idempotency-Key when the user omits one (API requires it on every write)', async () => {
			const pdfBuffer = Buffer.from('pdf');
			mockHttpRequest.mockResolvedValueOnce(pdfBuffer);
			mockHttpRequestWithAuthentication.mockResolvedValueOnce({ id: 'doc_no_idem' });

			const fn = getMockExecuteFunctions({
				documentName: 'No Idem Doc',
				source: 'file',
				fileSource: 'url',
				fileUrl: 'https://example.com/doc.pdf',
				'signers.signerValues': [],
				signatureValidations: {},
				configuration: {},
			});

			await node.execute.call(fn);
			const requestOptions = mockHttpRequestWithAuthentication.mock.calls[0][1];
			expect(requestOptions.headers).toBeDefined();
			expect(requestOptions.headers['Idempotency-Key']).toMatch(UUID_V4_REGEX);
		});

		it('should generate a different Idempotency-Key per item (not reused within the same execution)', async () => {
			mockHttpRequest.mockResolvedValueOnce(Buffer.from('pdf-1'));
			mockHttpRequest.mockResolvedValueOnce(Buffer.from('pdf-2'));
			mockHttpRequestWithAuthentication.mockResolvedValueOnce({ id: 'doc_a' });
			mockHttpRequestWithAuthentication.mockResolvedValueOnce({ id: 'doc_b' });

			const fn = getMockExecuteFunctions({
				documentName: 'Doc',
				source: 'file',
				fileSource: 'url',
				fileUrl: 'https://example.com/doc.pdf',
				'signers.signerValues': [],
				signatureValidations: {},
				configuration: {},
			});
			// Two input items in the same execution — one item per invocation of the loop body.
			(fn as unknown as Record<string, unknown>).getInputData = () => [{ json: {} }, { json: {} }];

			await node.execute.call(fn);

			expect(mockHttpRequestWithAuthentication).toHaveBeenCalledTimes(2);
			const keyA = mockHttpRequestWithAuthentication.mock.calls[0][1].headers['Idempotency-Key'];
			const keyB = mockHttpRequestWithAuthentication.mock.calls[1][1].headers['Idempotency-Key'];
			expect(keyA).toMatch(UUID_V4_REGEX);
			expect(keyB).toMatch(UUID_V4_REGEX);
			expect(keyA).not.toBe(keyB);
		});
	});

	// ----------------------------------------------------------
	// Multiple Signers
	// ----------------------------------------------------------
	describe('Multiple Signers', () => {
		it('should send multiple signers in one request', async () => {
			const pdfBuffer = Buffer.from('pdf');
			mockHttpRequest.mockResolvedValueOnce(pdfBuffer);
			mockHttpRequestWithAuthentication.mockResolvedValueOnce({ id: 'doc_multi', name: 'Multi-Signer' });

			const fn = getMockExecuteFunctions({
				documentName: 'Multi-Signer Doc',
				source: 'file',
				fileSource: 'url',
				fileUrl: 'https://example.com/doc.pdf',
				'signers.signerValues': [
					{ name: 'Alice', deliveryMethod: 'email', email: 'alice@test.com' },
					{ name: 'Bob', deliveryMethod: 'email', email: 'bob@test.com' },
					{ name: 'Charlie', deliveryMethod: 'whatsapp', whatsapp: '+525500000000' },
				],
				signatureValidations: {},
			});

			await node.execute.call(fn);

			// download + ONE create call = 1 authenticated call total
			expect(mockHttpRequestWithAuthentication).toHaveBeenCalledTimes(1);

			const body = mockHttpRequestWithAuthentication.mock.calls[0][1].body;
			expect(body.signers).toEqual([
				{ name: 'Alice', email: 'alice@test.com' },
				{ name: 'Bob', email: 'bob@test.com' },
				{ name: 'Charlie', phone: '+525500000000' },
			]);
		});
	});

	// ----------------------------------------------------------
	// Send Document — v3 POST /documents/{documentId}/send
	// ----------------------------------------------------------
	describe('Send Document', () => {
		it('should POST to /v3/documents/{documentId}/send with no body when no recipients are given', async () => {
			mockHttpRequestWithAuthentication.mockResolvedValueOnce({
				id: 'doc_123',
				object: 'document',
				status: 'awaiting_signatures',
			});

			const fn = getMockExecuteFunctions({
				operation: 'sendDocument',
				documentId: 'doc_123',
				'recipients.recipientValues': [],
			});

			const result = await node.execute.call(fn);

			expect(mockHttpRequest).not.toHaveBeenCalled();
			expect(mockHttpRequestWithAuthentication).toHaveBeenCalledTimes(1);

			const call = mockHttpRequestWithAuthentication.mock.calls[0][1];
			expect(call.method).toBe('POST');
			expect(call.url).toBe('https://api.allsign.io/v3/documents/doc_123/send');
			expect(call.body).toEqual({});
			expect(call.body.recipients).toBeUndefined();
			// The API requires Idempotency-Key on every write — auto-generated when omitted.
			expect(call.headers['Idempotency-Key']).toMatch(UUID_V4_REGEX);

			expect(result[0][0].json).toEqual(
				expect.objectContaining({ id: 'doc_123', status: 'awaiting_signatures' }),
			);
		});

		it('should include recipients[] (camelCase email/phone/name) when provided', async () => {
			mockHttpRequestWithAuthentication.mockResolvedValueOnce({ id: 'doc_456' });

			const fn = getMockExecuteFunctions({
				operation: 'sendDocument',
				documentId: 'doc_456',
				'recipients.recipientValues': [
					{ name: 'Alice', deliveryMethod: 'email', email: 'alice@test.com' },
					{ name: 'Bob', deliveryMethod: 'whatsapp', whatsapp: '+525500000000' },
				],
			});

			await node.execute.call(fn);
			const body = mockHttpRequestWithAuthentication.mock.calls[0][1].body;
			expect(body.recipients).toEqual([
				{ name: 'Alice', email: 'alice@test.com' },
				{ name: 'Bob', phone: '+525500000000' },
			]);
		});

		it('should allow a recipient with no name', async () => {
			mockHttpRequestWithAuthentication.mockResolvedValueOnce({ id: 'doc_noname' });

			const fn = getMockExecuteFunctions({
				operation: 'sendDocument',
				documentId: 'doc_noname',
				'recipients.recipientValues': [
					{ deliveryMethod: 'email', email: 'anon@test.com' },
				],
			});

			await node.execute.call(fn);
			const body = mockHttpRequestWithAuthentication.mock.calls[0][1].body;
			expect(body.recipients).toEqual([{ email: 'anon@test.com' }]);
		});

		it('should send the Idempotency-Key header when provided', async () => {
			mockHttpRequestWithAuthentication.mockResolvedValueOnce({ id: 'doc_idem' });

			const fn = getMockExecuteFunctions({
				operation: 'sendDocument',
				documentId: 'doc_idem',
				'recipients.recipientValues': [],
				idempotencyKey: 'send-order-4821',
			});

			await node.execute.call(fn);
			const requestOptions = mockHttpRequestWithAuthentication.mock.calls[0][1];
			expect(requestOptions.headers).toEqual({ 'Idempotency-Key': 'send-order-4821' });
		});

		it('should throw when Document ID is missing', async () => {
			const fn = getMockExecuteFunctions({
				operation: 'sendDocument',
				documentId: '',
				'recipients.recipientValues': [],
			});

			await expect(node.execute.call(fn)).rejects.toThrow('Document ID is required');
		});

		it('should throw when a recipient has Email delivery method but no email', async () => {
			const fn = getMockExecuteFunctions({
				operation: 'sendDocument',
				documentId: 'doc_bad',
				'recipients.recipientValues': [
					{ name: 'NoEmail', deliveryMethod: 'email', email: '' },
				],
			});

			await expect(node.execute.call(fn)).rejects.toThrow(
				'Recipient "NoEmail" has Email as delivery method but no email address was provided',
			);
		});

		it('should throw when a recipient has WhatsApp delivery method but no number', async () => {
			const fn = getMockExecuteFunctions({
				operation: 'sendDocument',
				documentId: 'doc_bad',
				'recipients.recipientValues': [
					{ name: 'NoPhone', deliveryMethod: 'whatsapp', whatsapp: '' },
				],
			});

			await expect(node.execute.call(fn)).rejects.toThrow(
				'Recipient "NoPhone" has WhatsApp as delivery method but no WhatsApp number was provided',
			);
		});

		it('should throw NodeApiError when the send request fails', async () => {
			mockHttpRequestWithAuthentication.mockRejectedValueOnce({
				message: 'Request failed with status code 409',
				response: { data: { message: 'Document already signed' }, status: 409 },
			});

			const fn = getMockExecuteFunctions({
				operation: 'sendDocument',
				documentId: 'doc_conflict',
				'recipients.recipientValues': [],
			});

			await expect(node.execute.call(fn)).rejects.toThrow();
		});

		it('should not call any Create Document parameters when sending', async () => {
			mockHttpRequestWithAuthentication.mockResolvedValueOnce({ id: 'doc_isolated' });

			const fn = getMockExecuteFunctions({
				operation: 'sendDocument',
				documentId: 'doc_isolated',
				'recipients.recipientValues': [],
			});

			await node.execute.call(fn);

			// No file download and no Create Document body shape
			expect(mockHttpRequest).not.toHaveBeenCalled();
			const body = mockHttpRequestWithAuthentication.mock.calls[0][1].body;
			expect(body).not.toHaveProperty('source');
			expect(body).not.toHaveProperty('signatureValidation');
			expect(body).not.toHaveProperty('name');
		});
	});

	// ----------------------------------------------------------
	// Auth Headers
	// ----------------------------------------------------------
	describe('Auth Headers', () => {
		it('should use httpRequestWithAuthentication with allSignApi credential', async () => {
			const pdfBuffer = Buffer.from('pdf');
			mockHttpRequest.mockResolvedValueOnce(pdfBuffer);
			mockHttpRequestWithAuthentication.mockResolvedValueOnce({ id: 'doc_auth' });

			const fn = getMockExecuteFunctions({
				documentName: 'Auth Test',
				source: 'file',
				fileSource: 'url',
				fileUrl: 'https://example.com/doc.pdf',
				'signers.signerValues': [],
				signatureValidations: {},
			});

			await node.execute.call(fn);
			expect(mockHttpRequestWithAuthentication.mock.calls[0][0]).toBe('allSignApi');
			expect(mockHttpRequestWithAuthentication.mock.calls[0][1].url).toBe('https://api.allsign.io/v3/documents');
		});
	});

	// ----------------------------------------------------------
	// Base URL Handling
	// ----------------------------------------------------------
	describe('Base URL Handling', () => {
		it('should strip trailing slashes from base URL', async () => {
			const pdfBuffer = Buffer.from('pdf');
			mockHttpRequest.mockResolvedValueOnce(pdfBuffer);
			mockHttpRequestWithAuthentication.mockResolvedValueOnce({ id: 'doc_slash' });

			const fn = getMockExecuteFunctions({
				documentName: 'Slash Test',
				source: 'file',
				fileSource: 'url',
				fileUrl: 'https://example.com/doc.pdf',
				'signers.signerValues': [],
				signatureValidations: {},
			});
			(fn as unknown as Record<string, unknown>).getCredentials = async () => ({
				apiKey: 'allsign_live_sk_test123',
				baseUrl: 'https://api.allsign.io/',
			});

			await node.execute.call(fn);
			expect(mockHttpRequestWithAuthentication.mock.calls[0][1].url).toBe('https://api.allsign.io/v3/documents');
		});

		it('should use custom base URL for dev environments', async () => {
			const pdfBuffer = Buffer.from('pdf');
			mockHttpRequest.mockResolvedValueOnce(pdfBuffer);
			mockHttpRequestWithAuthentication.mockResolvedValueOnce({ id: 'doc_dev' });

			const fn = getMockExecuteFunctions({
				documentName: 'Dev Doc',
				source: 'file',
				fileSource: 'url',
				fileUrl: 'https://example.com/doc.pdf',
				'signers.signerValues': [],
				signatureValidations: {},
			});
			(fn as unknown as Record<string, unknown>).getCredentials = async () => ({
				apiKey: 'allsign_trial_sk_dev456',
				baseUrl: 'http://localhost:8000',
			});

			await node.execute.call(fn);
			expect(mockHttpRequestWithAuthentication.mock.calls[0][1].url).toBe('http://localhost:8000/v3/documents');
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
				source: 'file',
				fileSource: 'url',
				fileUrl: 'https://example.com/doc.pdf',
				'signers.signerValues': [{ name: 'Test', deliveryMethod: 'email', email: 'test@test.com' }],
				signatureValidations: {},
			});

			await expect(node.execute.call(fn)).rejects.toThrow();
		});

		it('should throw when file download fails', async () => {
			mockHttpRequest.mockRejectedValueOnce(new Error('File not found'));

			const fn = getMockExecuteFunctions({
				documentName: 'Bad URL Doc',
				source: 'file',
				fileSource: 'url',
				fileUrl: 'https://example.com/nonexistent.pdf',
				'signers.signerValues': [{ name: 'Test', deliveryMethod: 'email', email: 'test@test.com' }],
				signatureValidations: {},
			});

			await expect(node.execute.call(fn)).rejects.toThrow('File not found');
		});

		it('should continue on fail when enabled', async () => {
			mockHttpRequest.mockRejectedValueOnce(new Error('Connection refused'));

			const fn = getMockExecuteFunctions({
				documentName: 'Fail Doc',
				source: 'file',
				fileSource: 'url',
				fileUrl: 'https://example.com/doc.pdf',
				'signers.signerValues': [],
				signatureValidations: {},
			});
			(fn as unknown as Record<string, unknown>).continueOnFail = () => true;

			const result = await node.execute.call(fn);
			expect(result[0][0].json).toHaveProperty('error');
		});
	});
});
