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
		it('should have correct display name and operation selector', () => {
			expect(node.description.displayName).toBe('AllSign');
			const opProp = node.description.properties.find((p) => p.name === 'operation');
			expect(opProp).toBeDefined();
			const opValues = (opProp as any).options.map((o: any) => o.value);
			expect(opValues).toContain('create');
			expect(opValues).toContain('get');
			expect(opValues).toContain('getMany');
			expect(opValues).toContain('void');
		});

		it('should have collapsible collections for create operation', () => {
			const names = ['notificationSettings', 'signatureValidations', 'additionalOptions'];
			for (const name of names) {
				const prop = node.description.properties.find((p) => p.name === name);
				expect(prop).toBeDefined();
				expect((prop as any).type).toBe('collection');
				expect((prop as any).displayOptions?.show?.operation).toEqual(['create']);
			}
		});

		it('should have codex aliases including WhatsApp and eIDAS', () => {
			const aliases = node.description.codex?.alias || [];
			expect(aliases).toContain('WhatsApp');
			expect(aliases).toContain('eIDAS');
			expect(aliases).toContain('FEA');
			expect(aliases).toContain('Firma');
		});

		it('should be usable as a tool', () => {
			expect(node.description.usableAsTool).toBe(true);
		});

		it('should have email as optional for signers', () => {
			const signers = node.description.properties.find((p) => p.name === 'signers');
			const signerFields = (signers as any).options[0].values;
			const emailField = signerFields.find((f: any) => f.name === 'email');
			expect(emailField.required).toBeUndefined();
		});

		it('should NOT have deprecated sendByEmail/sendByWhatsapp', () => {
			const notif = node.description.properties.find((p) => p.name === 'notificationSettings');
			const names = (notif as any).options.map((o: any) => o.name);
			expect(names).not.toContain('sendByEmail');
			expect(names).not.toContain('sendByWhatsapp');
			expect(names).toContain('sendInvitations');
		});

		it('should have eIDAS in Signature Validations', () => {
			const sigVal = node.description.properties.find((p) => p.name === 'signatureValidations');
			const names = (sigVal as any).options.map((o: any) => o.name);
			expect(names).toContain('verifyEidas');
		});

		it('should have expiresAt and placeholders in Additional Options', () => {
			const opts = node.description.properties.find((p) => p.name === 'additionalOptions');
			const names = (opts as any).options.map((o: any) => o.name);
			expect(names).toContain('expiresAt');
			expect(names).toContain('placeholders');
			expect(names).toContain('folderName');
		});

		it('should show documentId only for get and void operations', () => {
			const docId = node.description.properties.find((p) => p.name === 'documentId');
			expect((docId as any).displayOptions.show.operation).toEqual(['get', 'void']);
		});

		it('should show filters only for getMany operation', () => {
			const filters = node.description.properties.find((p) => p.name === 'filters');
			expect((filters as any).displayOptions.show.operation).toEqual(['getMany']);
		});
	});

	// ----------------------------------------------------------
	// GET Operation
	// ----------------------------------------------------------
	describe('Get Operation', () => {
		it('should GET a single document by ID', async () => {
			mockHttpRequest.mockResolvedValueOnce({
				id: 'doc-abc',
				name: 'My Contract',
				status: 'ESPERANDO_FIRMAS',
			});

			const fn = getMockExecuteFunctions({
				operation: 'get',
				documentId: 'doc-abc',
			});

			const result = await node.execute.call(fn);

			expect(mockHttpRequest).toHaveBeenCalledTimes(1);
			expect(mockHttpRequest).toHaveBeenCalledWith(expect.objectContaining({
				method: 'GET',
				url: 'https://api.allsign.io/v2/documents/doc-abc',
				headers: { Authorization: 'Bearer allsign_live_sk_test123' },
				json: true,
			}));
			expect(result[0][0].json).toEqual(expect.objectContaining({ id: 'doc-abc' }));
		});
	});

	// ----------------------------------------------------------
	// GET MANY Operation
	// ----------------------------------------------------------
	describe('Get Many Operation', () => {
		it('should GET documents with default params', async () => {
			mockHttpRequest.mockResolvedValueOnce({
				data: [
					{ id: 'doc-1', name: 'Doc 1' },
					{ id: 'doc-2', name: 'Doc 2' },
				],
				pagination: { cursor: 'next-abc', hasMore: true },
			});

			const fn = getMockExecuteFunctions({
				operation: 'getMany',
				limit: 20,
				filters: {},
			});

			const result = await node.execute.call(fn);

			expect(mockHttpRequest).toHaveBeenCalledTimes(1);
			expect(mockHttpRequest).toHaveBeenCalledWith(expect.objectContaining({
				method: 'GET',
				url: 'https://api.allsign.io/v2/documents/',
				qs: { limit: 20 },
			}));
			expect(result[0]).toHaveLength(2);
			expect(result[0][0].json).toEqual({ id: 'doc-1', name: 'Doc 1' });
			expect(result[0][1].json).toEqual({ id: 'doc-2', name: 'Doc 2' });
		});

		it('should pass all filters as query params', async () => {
			mockHttpRequest.mockResolvedValueOnce({ data: [], pagination: {} });

			const fn = getMockExecuteFunctions({
				operation: 'getMany',
				limit: 10,
				filters: {
					search: 'Contract',
					signatureStatus: 'TODOS_FIRMARON',
					sortBy: 'name',
					sortOrder: 'asc',
					folderId: 'folder-123',
					createdAfter: '2026-01-01T00:00:00Z',
					includeAllHistory: true,
				},
			});

			await node.execute.call(fn);

			expect(mockHttpRequest).toHaveBeenCalledWith(expect.objectContaining({
				qs: {
					limit: 10,
					search: 'Contract',
					signatureStatus: 'TODOS_FIRMARON',
					sortBy: 'name',
					sortOrder: 'asc',
					folderId: 'folder-123',
					createdAfter: '2026-01-01T00:00:00Z',
					includeAllHistory: true,
				},
			}));
		});

		it('should return raw response when no documents found', async () => {
			const emptyResponse = { data: [], pagination: { cursor: null, hasMore: false } };
			mockHttpRequest.mockResolvedValueOnce(emptyResponse);

			const fn = getMockExecuteFunctions({
				operation: 'getMany',
				limit: 20,
				filters: {},
			});

			const result = await node.execute.call(fn);
			expect(result[0]).toHaveLength(1);
			expect(result[0][0].json).toEqual(emptyResponse);
		});
	});

	// ----------------------------------------------------------
	// VOID Operation
	// ----------------------------------------------------------
	describe('Void Operation', () => {
		it('should POST void with reason', async () => {
			mockHttpRequest.mockResolvedValueOnce({
				success: true,
				message: 'Documento anulado. 2 firma(s) pendiente(s) cancelada(s).',
			});

			const fn = getMockExecuteFunctions({
				operation: 'void',
				documentId: 'doc-void-123',
				voidReason: 'Contract terms changed',
			});

			const result = await node.execute.call(fn);

			expect(mockHttpRequest).toHaveBeenCalledTimes(1);
			expect(mockHttpRequest).toHaveBeenCalledWith(expect.objectContaining({
				method: 'POST',
				url: 'https://api.allsign.io/v2/documents/doc-void-123/void',
				body: { reason: 'Contract terms changed' },
				json: true,
			}));
			expect(result[0][0].json.success).toBe(true);
		});

		it('should POST void with empty reason', async () => {
			mockHttpRequest.mockResolvedValueOnce({ success: true, message: 'Voided' });

			const fn = getMockExecuteFunctions({
				operation: 'void',
				documentId: 'doc-void-456',
				voidReason: '',
			});

			await node.execute.call(fn);

			expect(mockHttpRequest).toHaveBeenCalledWith(expect.objectContaining({
				body: { reason: '' },
			}));
		});
	});

	// ----------------------------------------------------------
	// CREATE Operation
	// ----------------------------------------------------------
	describe('Create Operation', () => {
		it('should POST with V2 schema and no deprecated fields', async () => {
			const pdfBuffer = Buffer.from('fake-pdf');
			mockHttpRequest.mockResolvedValueOnce(pdfBuffer);
			mockHttpRequest.mockResolvedValueOnce({ id: 'doc-123', name: 'Test' });
			mockHttpRequest.mockResolvedValueOnce({ invited: 1 });

			const fn = getMockExecuteFunctions({
				operation: 'create',
				documentName: 'Test Contract',
				fileSource: 'url',
				fileUrl: 'https://example.com/contract.pdf',
				'signers.signerValues': [{ name: 'John', email: 'john@test.com' }],
				notificationSettings: { sendInvitations: true },
				signatureValidations: { verifyAutografa: true },
			});

			const result = await node.execute.call(fn);

			expect(mockHttpRequest).toHaveBeenCalledTimes(3);
			const postBody = mockHttpRequest.mock.calls[1][0].body;
			expect(postBody.config).toEqual({ sendInvitations: false, startAtStep: 2 });
			expect(postBody.config).not.toHaveProperty('sendByEmail');
			expect(postBody.config).not.toHaveProperty('sendByWhatsapp');
			expect(result[0][0].json).toEqual(expect.objectContaining({ id: 'doc-123' }));
		});

		it('should default autografa to true', async () => {
			const pdfBuffer = Buffer.from('pdf');
			mockHttpRequest.mockResolvedValueOnce(pdfBuffer);
			mockHttpRequest.mockResolvedValueOnce({ id: 'doc-456' });

			const fn = getMockExecuteFunctions({
				operation: 'create',
				documentName: 'Simple',
				fileSource: 'url',
				fileUrl: 'https://example.com/s.pdf',
				'signers.signerValues': [{ name: 'Jane', email: 'jane@t.com' }],
				notificationSettings: { sendInvitations: true },
				signatureValidations: {},
			});

			await node.execute.call(fn);
			expect(mockHttpRequest.mock.calls[1][0].body.signatureValidation.autografa).toBe(true);
		});
	});

	// ----------------------------------------------------------
	// Phone-Only Signers
	// ----------------------------------------------------------
	describe('Phone-Only Signers', () => {
		it('should create participant with only whatsapp', async () => {
			const pdfBuffer = Buffer.from('pdf');
			mockHttpRequest.mockResolvedValueOnce(pdfBuffer);
			mockHttpRequest.mockResolvedValueOnce({ id: 'doc-phone' });
			mockHttpRequest.mockResolvedValueOnce({ invited: 1 });

			const fn = getMockExecuteFunctions({
				operation: 'create',
				documentName: 'Phone Doc',
				fileSource: 'url',
				fileUrl: 'https://example.com/d.pdf',
				'signers.signerValues': [{ name: 'Carlos', email: '', countryCode: '+52', phoneNumber: '5512345678' }],
				notificationSettings: { sendInvitations: true },
				signatureValidations: {},
			});

			await node.execute.call(fn);
			const body = mockHttpRequest.mock.calls[1][0].body;
			expect(body.participants).toEqual([{ name: 'Carlos', whatsapp: '+525512345678' }]);
			expect(body.participants[0]).not.toHaveProperty('email');
		});

		it('should throw when signer has neither email nor phone', async () => {
			mockHttpRequest.mockResolvedValueOnce(Buffer.from('pdf'));

			const fn = getMockExecuteFunctions({
				operation: 'create',
				documentName: 'Bad',
				fileSource: 'url',
				fileUrl: 'https://example.com/d.pdf',
				'signers.signerValues': [{ name: 'NoContact', email: '', phoneNumber: '' }],
				notificationSettings: {},
				signatureValidations: {},
			});

			await expect(node.execute.call(fn)).rejects.toThrow(
				'Signer "NoContact" must have at least an email address or a WhatsApp phone number',
			);
		});
	});

	// ----------------------------------------------------------
	// Signature Validation Mappings
	// ----------------------------------------------------------
	describe('Signature Validation', () => {
		it('should map video → videofirma and biometric → biometric_signature', async () => {
			mockHttpRequest.mockResolvedValueOnce(Buffer.from('pdf'));
			mockHttpRequest.mockResolvedValueOnce({ id: 'doc-m' });

			const fn = getMockExecuteFunctions({
				operation: 'create',
				documentName: 'Map',
				fileSource: 'url',
				fileUrl: 'https://example.com/d.pdf',
				'signers.signerValues': [{ name: 'T', email: 't@t.com' }],
				notificationSettings: { sendInvitations: true },
				signatureValidations: { verifyVideo: true, verifyBiometricSelfie: true },
			});

			await node.execute.call(fn);
			const sv = mockHttpRequest.mock.calls[1][0].body.signatureValidation;
			expect(sv.videofirma).toBe(true);
			expect(sv.biometric_signature).toBe(true);
		});

		it('should set all validation fields including eIDAS', async () => {
			mockHttpRequest.mockResolvedValueOnce(Buffer.from('pdf'));
			mockHttpRequest.mockResolvedValueOnce({ id: 'doc-v' });

			const fn = getMockExecuteFunctions({
				operation: 'create',
				documentName: 'V',
				fileSource: 'url',
				fileUrl: 'https://example.com/d.pdf',
				'signers.signerValues': [{ name: 'T', email: 't@t.com' }],
				notificationSettings: { sendInvitations: true },
				signatureValidations: { verifyFea: true, verifyEidas: true, verifyNom151: true },
			});

			await node.execute.call(fn);
			const sv = mockHttpRequest.mock.calls[1][0].body.signatureValidation;
			expect(sv.FEA).toBe(true);
			expect(sv.eidas).toBe(true);
			expect(sv.nom151).toBe(true);
		});
	});

	// ----------------------------------------------------------
	// New Features
	// ----------------------------------------------------------
	describe('New Features', () => {
		it('should include placeholders in body', async () => {
			mockHttpRequest.mockResolvedValueOnce(Buffer.from('pdf'));
			mockHttpRequest.mockResolvedValueOnce({ id: 'doc-ph' });

			const fn = getMockExecuteFunctions({
				operation: 'create',
				documentName: 'Template',
				fileSource: 'url',
				fileUrl: 'https://example.com/t.docx',
				'signers.signerValues': [],
				notificationSettings: { sendInvitations: false },
				signatureValidations: {},
				additionalOptions: { placeholders: '{"client": "Juan"}' },
			});

			await node.execute.call(fn);
			expect(mockHttpRequest.mock.calls[1][0].body.placeholders).toEqual({ client: 'Juan' });
		});

		it('should include expiresAt in config', async () => {
			mockHttpRequest.mockResolvedValueOnce(Buffer.from('pdf'));
			mockHttpRequest.mockResolvedValueOnce({ id: 'doc-ex' });

			const fn = getMockExecuteFunctions({
				operation: 'create',
				documentName: 'Exp',
				fileSource: 'url',
				fileUrl: 'https://example.com/d.pdf',
				'signers.signerValues': [],
				notificationSettings: { sendInvitations: false },
				signatureValidations: {},
				additionalOptions: { expiresAt: '2026-04-01T00:00:00Z' },
			});

			await node.execute.call(fn);
			expect(mockHttpRequest.mock.calls[1][0].body.config.expiresAt).toBe('2026-04-01T00:00:00Z');
		});
	});

	// ----------------------------------------------------------
	// Error Handling (shared across operations)
	// ----------------------------------------------------------
	describe('Error Handling', () => {
		it('should throw on API failure for get', async () => {
			mockHttpRequest.mockRejectedValueOnce({
				response: { data: { detail: 'Document not found' }, status: 404 },
			});

			const fn = getMockExecuteFunctions({ operation: 'get', documentId: 'bad-id' });
			await expect(node.execute.call(fn)).rejects.toThrow('AllSign API Error: Document not found');
		});

		it('should throw on API failure for void', async () => {
			mockHttpRequest.mockRejectedValueOnce({
				response: { data: { detail: { error: 'already_completed', message: 'Already signed' } }, status: 400 },
			});

			const fn = getMockExecuteFunctions({ operation: 'void', documentId: 'done-id', voidReason: '' });
			await expect(node.execute.call(fn)).rejects.toThrow('AllSign API Error');
		});

		it('should continue on fail when enabled', async () => {
			mockHttpRequest.mockRejectedValueOnce(new Error('Connection refused'));

			const fn = getMockExecuteFunctions({ operation: 'get', documentId: 'x' });
			(fn as any).continueOnFail = () => true;

			const result = await node.execute.call(fn);
			expect(result[0][0].json).toHaveProperty('error', 'Connection refused');
		});
	});

	// ----------------------------------------------------------
	// Auth Headers (shared)
	// ----------------------------------------------------------
	describe('Auth Headers', () => {
		it('should include Bearer header in all operations', async () => {
			mockHttpRequest.mockResolvedValueOnce({ id: 'doc-1' });

			const fn = getMockExecuteFunctions({ operation: 'get', documentId: 'doc-1' });
			await node.execute.call(fn);

			expect(mockHttpRequest.mock.calls[0][0].headers).toEqual({
				Authorization: 'Bearer allsign_live_sk_test123',
			});
		});
	});
});
