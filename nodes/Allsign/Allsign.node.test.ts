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
		// `stableIdempotencyKey` lo usa para derivar una llave determinista por
		// (ejecución, item, operación). Fijo en los tests para que la llave sea
		// reproducible y se pueda afirmar sobre ella.
		getExecutionId: () => 'exec_test_1',
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

		it('should have a Resource selector with a single Document option (Resource + Operation pattern)', () => {
			const resourceProp = node.description.properties.find((p) => p.name === 'resource');
			expect(resourceProp).toBeDefined();
			expect((resourceProp as NodeProp).type).toBe('options');
			expect((resourceProp as NodeProp).default).toBe('document');
			const values = (resourceProp as NodeProp).options!.map((o: NodeProp) => o.value);
			expect(values).toEqual(['document']);
			// Resource must be the very first property (n8n convention)
			expect(node.description.properties[0].name).toBe('resource');
		});

		it('should have an Operation selector with all 8 operations, shown only for Resource = Document', () => {
			const operationProp = node.description.properties.find((p) => p.name === 'operation');
			expect(operationProp).toBeDefined();
			expect((operationProp as NodeProp).type).toBe('options');
			expect((operationProp as NodeProp).default).toBe('createDocument');
			expect((operationProp as NodeProp).displayOptions.show.resource).toEqual(['document']);
			const values = (operationProp as NodeProp).options!.map((o: NodeProp) => o.value);
			expect(values).toEqual([
				'createDocument',
				'getDocument',
				'getDocumentEvidence',
				'listDocuments',
				'listDocumentSigners',
				'remindSigner',
				'sendDocument',
				'voidDocument',
			]);
		});

		it('should show Document ID for every operation that needs it, gated on Resource = Document too', () => {
			const documentIdProp = node.description.properties.find((p) => p.name === 'documentId');
			expect(documentIdProp).toBeDefined();
			expect((documentIdProp as NodeProp).displayOptions.show.resource).toEqual(['document']);
			expect((documentIdProp as NodeProp).displayOptions.show.operation).toEqual([
				'sendDocument',
				'getDocument',
				'listDocumentSigners',
				'getDocumentEvidence',
				'voidDocument',
				'remindSigner',
			]);
		});

		it('should share Idempotency Key across the three write operations (Send/Void/Remind), gated on Resource = Document too', () => {
			const idempotencyKeyProp = node.description.properties.find((p) => p.name === 'idempotencyKey');
			expect(idempotencyKeyProp).toBeDefined();
			expect((idempotencyKeyProp as NodeProp).displayOptions.show.resource).toEqual(['document']);
			expect((idempotencyKeyProp as NodeProp).displayOptions.show.operation).toEqual([
				'sendDocument',
				'voidDocument',
				'remindSigner',
			]);
		});

		it('should gate every top-level operation-specific field on Resource = Document as well', () => {
			const gatedFieldNames = [
				'documentName',
				'source',
				'fileSource',
				'binaryProperty',
				'fileUrl',
				'templateId',
				'templateValues',
				'signers',
				'signatureValidations',
				'configuration',
				'documentId',
				'recipients',
				'idempotencyKey',
				'reason',
				'signerId',
				'limit',
				'filters',
			];
			for (const name of gatedFieldNames) {
				const prop = node.description.properties.find((p) => p.name === name);
				expect(prop).toBeDefined();
				expect((prop as NodeProp).displayOptions?.show?.resource).toEqual(['document']);
			}
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
	// Get Document — v3 GET /documents/{documentId}
	// ----------------------------------------------------------
	describe('Get Document', () => {
		it('should GET /v3/documents/{documentId} with no body and no Idempotency-Key header', async () => {
			mockHttpRequestWithAuthentication.mockResolvedValueOnce({
				id: 'doc_789',
				object: 'document',
				name: 'Contract',
				status: 'completed',
			});

			const fn = getMockExecuteFunctions({
				operation: 'getDocument',
				documentId: 'doc_789',
			});

			const result = await node.execute.call(fn);

			expect(mockHttpRequest).not.toHaveBeenCalled();
			expect(mockHttpRequestWithAuthentication).toHaveBeenCalledTimes(1);

			const call = mockHttpRequestWithAuthentication.mock.calls[0][1];
			expect(call.method).toBe('GET');
			expect(call.url).toBe('https://api.allsign.io/v3/documents/doc_789');
			expect(call.body).toBeUndefined();
			expect(call.headers).toBeUndefined();

			expect(result[0][0].json).toEqual(
				expect.objectContaining({ id: 'doc_789', name: 'Contract', status: 'completed' }),
			);
		});

		it('should throw when Document ID is missing', async () => {
			const fn = getMockExecuteFunctions({
				operation: 'getDocument',
				documentId: '',
			});

			await expect(node.execute.call(fn)).rejects.toThrow('Document ID is required');
		});

		it('should throw NodeApiError when the document is not found (404)', async () => {
			mockHttpRequestWithAuthentication.mockRejectedValueOnce({
				message: 'Request failed with status code 404',
				response: { data: { message: 'Document not found' }, status: 404 },
			});

			const fn = getMockExecuteFunctions({
				operation: 'getDocument',
				documentId: 'doc_missing',
			});

			await expect(node.execute.call(fn)).rejects.toThrow();
		});

		it('should use httpRequestWithAuthentication with allSignApi credential', async () => {
			mockHttpRequestWithAuthentication.mockResolvedValueOnce({ id: 'doc_auth_get' });

			const fn = getMockExecuteFunctions({
				operation: 'getDocument',
				documentId: 'doc_auth_get',
			});

			await node.execute.call(fn);
			expect(mockHttpRequestWithAuthentication.mock.calls[0][0]).toBe('allSignApi');
		});

		it('should continue on fail when enabled', async () => {
			mockHttpRequestWithAuthentication.mockRejectedValueOnce(new Error('Connection refused'));

			const fn = getMockExecuteFunctions({
				operation: 'getDocument',
				documentId: 'doc_fail',
			});
			(fn as unknown as Record<string, unknown>).continueOnFail = () => true;

			const result = await node.execute.call(fn);
			expect(result[0][0].json).toHaveProperty('error');
		});
	});

	// ----------------------------------------------------------
	// List Documents — v3 GET /documents
	// ----------------------------------------------------------
	describe('List Documents', () => {
		it('should GET /v3/documents with limit=20 by default, no body, no Idempotency-Key', async () => {
			mockHttpRequestWithAuthentication.mockResolvedValueOnce({
				object: 'list',
				data: [{ id: 'doc_1' }, { id: 'doc_2' }],
				hasMore: false,
			});

			const fn = getMockExecuteFunctions({
				operation: 'listDocuments',
			});

			const result = await node.execute.call(fn);

			expect(mockHttpRequestWithAuthentication).toHaveBeenCalledTimes(1);
			const call = mockHttpRequestWithAuthentication.mock.calls[0][1];
			expect(call.method).toBe('GET');
			expect(call.url).toBe('https://api.allsign.io/v3/documents');
			expect(call.qs).toEqual({ limit: 20 });
			expect(call.body).toBeUndefined();
			expect(call.headers).toBeUndefined();

			expect(result[0][0].json).toEqual(
				expect.objectContaining({ object: 'list', data: [{ id: 'doc_1' }, { id: 'doc_2' }] }),
			);
		});

		it('should only include filters the user actually set', async () => {
			mockHttpRequestWithAuthentication.mockResolvedValueOnce({ object: 'list', data: [] });

			const fn = getMockExecuteFunctions({
				operation: 'listDocuments',
				limit: 5,
				filters: {
					status: 'completed',
					scope: 'org',
					search: 'contract',
					startingAfter: 'doc_abc',
					folderId: 'fld_123',
					includeTotal: true,
				},
			});

			await node.execute.call(fn);
			const call = mockHttpRequestWithAuthentication.mock.calls[0][1];
			expect(call.qs).toEqual({
				limit: 5,
				status: 'completed',
				scope: 'org',
				search: 'contract',
				startingAfter: 'doc_abc',
				folderId: 'fld_123',
				includeTotal: true,
			});
		});

		it('should not send includeTotal or empty filters when left at defaults', async () => {
			mockHttpRequestWithAuthentication.mockResolvedValueOnce({ object: 'list', data: [] });

			const fn = getMockExecuteFunctions({
				operation: 'listDocuments',
				filters: {},
			});

			await node.execute.call(fn);
			const call = mockHttpRequestWithAuthentication.mock.calls[0][1];
			expect(call.qs).toEqual({ limit: 20 });
		});

		it('should throw NodeApiError on API failure', async () => {
			mockHttpRequestWithAuthentication.mockRejectedValueOnce({
				message: 'Request failed with status code 401',
				response: { data: { message: 'Unauthorized' }, status: 401 },
			});

			const fn = getMockExecuteFunctions({ operation: 'listDocuments' });

			await expect(node.execute.call(fn)).rejects.toThrow();
		});
	});

	// ----------------------------------------------------------
	// List Signers — v3 GET /documents/{documentId}/signers
	// ----------------------------------------------------------
	describe('List Signers', () => {
		it('should GET /v3/documents/{documentId}/signers with no body and no Idempotency-Key', async () => {
			mockHttpRequestWithAuthentication.mockResolvedValueOnce({
				object: 'list',
				data: [{ id: 'sgr_1', status: 'signed' }],
			});

			const fn = getMockExecuteFunctions({
				operation: 'listDocumentSigners',
				documentId: 'doc_123',
			});

			const result = await node.execute.call(fn);

			const call = mockHttpRequestWithAuthentication.mock.calls[0][1];
			expect(call.method).toBe('GET');
			expect(call.url).toBe('https://api.allsign.io/v3/documents/doc_123/signers');
			expect(call.body).toBeUndefined();
			expect(call.headers).toBeUndefined();

			expect(result[0][0].json).toEqual(
				expect.objectContaining({ data: [{ id: 'sgr_1', status: 'signed' }] }),
			);
		});

		it('should throw when Document ID is missing', async () => {
			const fn = getMockExecuteFunctions({
				operation: 'listDocumentSigners',
				documentId: '',
			});

			await expect(node.execute.call(fn)).rejects.toThrow('Document ID is required');
		});

		it('should throw NodeApiError when the document is not found', async () => {
			mockHttpRequestWithAuthentication.mockRejectedValueOnce({
				message: 'Request failed with status code 404',
				response: { data: { message: 'Document not found' }, status: 404 },
			});

			const fn = getMockExecuteFunctions({
				operation: 'listDocumentSigners',
				documentId: 'doc_missing',
			});

			await expect(node.execute.call(fn)).rejects.toThrow();
		});
	});

	// ----------------------------------------------------------
	// Get Evidence — v3 GET /documents/{documentId}/evidence
	// ----------------------------------------------------------
	describe('Get Evidence', () => {
		it('should GET /v3/documents/{documentId}/evidence with no body and no Idempotency-Key', async () => {
			mockHttpRequestWithAuthentication.mockResolvedValueOnce({
				documentId: 'doc_123',
				available: false,
				evidencePdf: null,
				nom151: null,
			});

			const fn = getMockExecuteFunctions({
				operation: 'getDocumentEvidence',
				documentId: 'doc_123',
			});

			const result = await node.execute.call(fn);

			const call = mockHttpRequestWithAuthentication.mock.calls[0][1];
			expect(call.method).toBe('GET');
			expect(call.url).toBe('https://api.allsign.io/v3/documents/doc_123/evidence');
			expect(call.body).toBeUndefined();
			expect(call.headers).toBeUndefined();

			expect(result[0][0].json).toEqual(expect.objectContaining({ available: false }));
		});

		it('should throw when Document ID is missing', async () => {
			const fn = getMockExecuteFunctions({
				operation: 'getDocumentEvidence',
				documentId: '',
			});

			await expect(node.execute.call(fn)).rejects.toThrow('Document ID is required');
		});

		it('should throw NodeApiError on API failure', async () => {
			mockHttpRequestWithAuthentication.mockRejectedValueOnce({
				message: 'Request failed with status code 404',
				response: { data: { message: 'Document not found' }, status: 404 },
			});

			const fn = getMockExecuteFunctions({
				operation: 'getDocumentEvidence',
				documentId: 'doc_missing',
			});

			await expect(node.execute.call(fn)).rejects.toThrow();
		});
	});

	// ----------------------------------------------------------
	// Void Document — v3 POST /documents/{documentId}/void
	// ----------------------------------------------------------
	describe('Void Document', () => {
		it('should POST /v3/documents/{documentId}/void with an auto-generated Idempotency-Key and no reason', async () => {
			mockHttpRequestWithAuthentication.mockResolvedValueOnce({
				id: 'doc_123',
				status: 'voided',
			});

			const fn = getMockExecuteFunctions({
				operation: 'voidDocument',
				documentId: 'doc_123',
			});

			const result = await node.execute.call(fn);

			const call = mockHttpRequestWithAuthentication.mock.calls[0][1];
			expect(call.method).toBe('POST');
			expect(call.url).toBe('https://api.allsign.io/v3/documents/doc_123/void');
			expect(call.body).toEqual({});
			expect(call.headers['Idempotency-Key']).toMatch(UUID_V4_REGEX);

			expect(result[0][0].json).toEqual(expect.objectContaining({ status: 'voided' }));
		});

		it('should include reason in the body when provided', async () => {
			mockHttpRequestWithAuthentication.mockResolvedValueOnce({ id: 'doc_456', status: 'voided' });

			const fn = getMockExecuteFunctions({
				operation: 'voidDocument',
				documentId: 'doc_456',
				reason: 'Contract superseded',
			});

			await node.execute.call(fn);
			const body = mockHttpRequestWithAuthentication.mock.calls[0][1].body;
			expect(body).toEqual({ reason: 'Contract superseded' });
		});

		it('should respect a user-provided Idempotency Key', async () => {
			mockHttpRequestWithAuthentication.mockResolvedValueOnce({ id: 'doc_789' });

			const fn = getMockExecuteFunctions({
				operation: 'voidDocument',
				documentId: 'doc_789',
				idempotencyKey: 'void-order-99',
			});

			await node.execute.call(fn);
			const requestOptions = mockHttpRequestWithAuthentication.mock.calls[0][1];
			expect(requestOptions.headers).toEqual({ 'Idempotency-Key': 'void-order-99' });
		});

		it('should throw when Document ID is missing', async () => {
			const fn = getMockExecuteFunctions({
				operation: 'voidDocument',
				documentId: '',
			});

			await expect(node.execute.call(fn)).rejects.toThrow('Document ID is required');
		});

		it('should throw NodeApiError when the document is already fully signed', async () => {
			mockHttpRequestWithAuthentication.mockRejectedValueOnce({
				message: 'Request failed with status code 409',
				response: { data: { message: 'A fully signed document cannot be voided.' }, status: 409 },
			});

			const fn = getMockExecuteFunctions({
				operation: 'voidDocument',
				documentId: 'doc_signed',
			});

			await expect(node.execute.call(fn)).rejects.toThrow();
		});
	});

	// ----------------------------------------------------------
	// Remind Signer — v3 POST /documents/{documentId}/signers/{signerId}/remind
	// ----------------------------------------------------------
	describe('Remind Signer', () => {
		it('should POST .../remind with an auto-generated Idempotency-Key and no body', async () => {
			mockHttpRequestWithAuthentication.mockResolvedValueOnce({
				documentId: 'doc_123',
				signerId: 'sgr_456',
				delivered: true,
				channel: 'email',
			});

			const fn = getMockExecuteFunctions({
				operation: 'remindSigner',
				documentId: 'doc_123',
				signerId: 'sgr_456',
			});

			const result = await node.execute.call(fn);

			const call = mockHttpRequestWithAuthentication.mock.calls[0][1];
			expect(call.method).toBe('POST');
			expect(call.url).toBe('https://api.allsign.io/v3/documents/doc_123/signers/sgr_456/remind');
			expect(call.body).toBeUndefined();
			expect(call.headers['Idempotency-Key']).toMatch(UUID_V4_REGEX);

			expect(result[0][0].json).toEqual(expect.objectContaining({ delivered: true, channel: 'email' }));
		});

		it('should respect a user-provided Idempotency Key', async () => {
			mockHttpRequestWithAuthentication.mockResolvedValueOnce({ delivered: true });

			const fn = getMockExecuteFunctions({
				operation: 'remindSigner',
				documentId: 'doc_123',
				signerId: 'sgr_456',
				idempotencyKey: 'remind-order-7',
			});

			await node.execute.call(fn);
			const requestOptions = mockHttpRequestWithAuthentication.mock.calls[0][1];
			expect(requestOptions.headers).toEqual({ 'Idempotency-Key': 'remind-order-7' });
		});

		it('should throw when Document ID is missing', async () => {
			const fn = getMockExecuteFunctions({
				operation: 'remindSigner',
				documentId: '',
				signerId: 'sgr_456',
			});

			await expect(node.execute.call(fn)).rejects.toThrow('Document ID is required');
		});

		it('should throw when Signer ID is missing', async () => {
			const fn = getMockExecuteFunctions({
				operation: 'remindSigner',
				documentId: 'doc_123',
				signerId: '',
			});

			await expect(node.execute.call(fn)).rejects.toThrow('Signer ID is required');
		});

		it('should throw NodeApiError when rate-limited (429)', async () => {
			mockHttpRequestWithAuthentication.mockRejectedValueOnce({
				message: 'Request failed with status code 429',
				response: { data: { message: 'Reminder already sent recently' }, status: 429 },
			});

			const fn = getMockExecuteFunctions({
				operation: 'remindSigner',
				documentId: 'doc_123',
				signerId: 'sgr_456',
			});

			await expect(node.execute.call(fn)).rejects.toThrow();
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
	// ─────────────────────────────────────────────────────────────────────────
	// Idempotency-Key determinista
	//
	// n8n reintenta un nodo por su cuenta cuando el POST hace timeout o
	// devuelve 5xx. Con `randomUUID()` cada intento mandaba una llave nueva, la
	// API veía dos peticiones distintas, y creaba DOS documentos cobrando dos
	// veces. Estos tests son el guard de eso.
	// ─────────────────────────────────────────────────────────────────────────
	describe('Idempotency-Key determinista', () => {
		const keyOf = (call: number) =>
			mockHttpRequestWithAuthentication.mock.calls[call][1].headers['Idempotency-Key'] as string;

		const sendOnce = async () => {
			mockHttpRequestWithAuthentication.mockResolvedValueOnce({ id: 'doc_123' });
			const fn = getMockExecuteFunctions({
				operation: 'sendDocument',
				documentId: 'doc_123',
				'recipients.recipientValues': [{ deliveryMethod: 'email', email: 'a@b.mx' }],
			});
			await node.execute.call(fn);
		};

		it('el mismo item reintentado reusa la MISMA llave — la API replaya en vez de duplicar', async () => {
			await sendOnce();
			const primera = keyOf(0);
			mockHttpRequestWithAuthentication.mockClear();
			await sendOnce();
			expect(keyOf(0)).toBe(primera);
		});

		it('operaciones distintas del mismo item NO colisionan', async () => {
			await sendOnce();
			const llaveSend = keyOf(0);
			mockHttpRequestWithAuthentication.mockClear();

			mockHttpRequestWithAuthentication.mockResolvedValueOnce({ id: 'doc_123' });
			await node.execute.call(
				getMockExecuteFunctions({ operation: 'voidDocument', documentId: 'doc_123' }),
			);
			// Si colisionaran, el void se replayaría como si fuera el send y
			// devolvería la respuesta del send — silenciosamente, sin anular nada.
			expect(keyOf(0)).not.toBe(llaveSend);
		});

		it('la llave cumple el UUID v4 ESTRICTO que valida la API', async () => {
			// app/api/v3/idempotency.py rechaza con IDEMPOTENCY_KEY_INVALID
			// cualquier cosa fuera de este patrón — el `4` y el `[89ab]` incluidos.
			await sendOnce();
			expect(keyOf(0)).toMatch(
				/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
			);
		});

		it('una llave puesta por el usuario sigue ganando', async () => {
			mockHttpRequestWithAuthentication.mockResolvedValueOnce({ id: 'doc_123' });
			const fn = getMockExecuteFunctions({
				operation: 'sendDocument',
				documentId: 'doc_123',
				idempotencyKey: 'mi-llave-estable',
				'recipients.recipientValues': [{ deliveryMethod: 'email', email: 'a@b.mx' }],
			});
			await node.execute.call(fn);
			expect(keyOf(0)).toBe('mi-llave-estable');
		});
	});

});
