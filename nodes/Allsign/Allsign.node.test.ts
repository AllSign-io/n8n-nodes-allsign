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

		it('should define only the document resource', () => {
			const resourceProp = node.description.properties.find(
				(p) => p.name === 'resource',
			);
			expect(resourceProp).toBeDefined();
			const resourceOptions = (resourceProp as any).options.map((o: any) => o.value);
			expect(resourceOptions).toEqual(['document']);
		});

		it('should define createAndSend operation', () => {
			const opProp = node.description.properties.find(
				(p) => p.name === 'operation' && (p.displayOptions?.show?.resource as string[])?.includes('document'),
			);
			const opValues = (opProp as any).options.map((o: any) => o.value);
			expect(opValues).toContain('createAndSend');
		});

		it('should have codex aliases for discoverability', () => {
			const aliases = node.description.codex?.alias || [];
			expect(aliases).toContain('Firma');
			expect(aliases).toContain('Documento');
			expect(aliases).toContain('Signature');
			expect(aliases).toContain('PDF');
			expect(aliases).toContain('NOM-151');
			expect(aliases).toContain('FEA');
			expect(aliases).toContain('eIDAS');
		});

		it('should be usable as a tool', () => {
			expect(node.description.usableAsTool).toBe(true);
		});
	});

	// ----------------------------------------------------------
	// Autógrafa Property
	// ----------------------------------------------------------
	describe('Autógrafa Property', () => {
		it('should be a boolean toggle', () => {
			const autografaProp = node.description.properties.find(
				(p) => p.name === 'verifyAutografa',
			);
			expect(autografaProp).toBeDefined();
			expect(autografaProp?.type).toBe('boolean');
			expect(autografaProp?.default).toBe(false);
		});
	});

	// ----------------------------------------------------------
	// Verification Properties
	// ----------------------------------------------------------
	describe('Verification Properties', () => {
		it('should have all top-level verification toggles', () => {
			const verificationNames = ['verifyFea', 'verifyNom151', 'verifyVideo', 'verifyConfirmName', 'verifyIdentity'];
			for (const name of verificationNames) {
				const prop = node.description.properties.find((p) => p.name === name);
				expect(prop).toBeDefined();
				expect(prop?.type).toBe('boolean');
			}
		});

		it('should show ID scan only when identity verification is enabled', () => {
			const idScanProp = node.description.properties.find((p) => p.name === 'verifyIdScan');
			expect(idScanProp).toBeDefined();
			expect(idScanProp?.displayOptions?.show?.verifyIdentity).toEqual([true]);
		});

		it('should show biometric selfie only when identity verification is enabled', () => {
			const selfieProp = node.description.properties.find((p) => p.name === 'verifyBiometricSelfie');
			expect(selfieProp).toBeDefined();
			expect(selfieProp?.displayOptions?.show?.verifyIdentity).toEqual([true]);
		});

		it('should show SynthID only when biometric selfie is enabled', () => {
			const synthProp = node.description.properties.find((p) => p.name === 'verifySynthId');
			expect(synthProp).toBeDefined();
			expect(synthProp?.displayOptions?.show?.verifyIdentity).toEqual([true]);
			expect(synthProp?.displayOptions?.show?.verifyBiometricSelfie).toEqual([true]);
		});
	});

	// ----------------------------------------------------------
	// Create & Send (URL) — V2 Schema
	// ----------------------------------------------------------
	describe('Create & Send (URL)', () => {
		it('should download the file, convert to base64, and POST with V2 document schema', async () => {
			// First call: download PDF from URL → returns Buffer
			const pdfBuffer = Buffer.from('fake-pdf-content');
			mockHttpRequest.mockResolvedValueOnce(pdfBuffer);
			// Second call: POST to /v2/documents/ → returns response with id
			mockHttpRequest.mockResolvedValueOnce({ id: 'doc-123', name: 'Test Contract' });
			// Third call: POST to /v2/documents/doc-123/invite-bulk
			mockHttpRequest.mockResolvedValueOnce({ invited: 1 });

			const fn = getMockExecuteFunctions({
				resource: 'document',
				operation: 'createAndSend',
				documentName: 'Test Contract',
				fileSource: 'url',
				fileUrl: 'https://example.com/contract.pdf',
				'signers.signerValues': [{ name: 'John', email: 'john@test.com' }],
				verifyAutografa: true,
				verifyFea: false,
				verifyNom151: false,
				verifyVideo: false,
				verifyConfirmName: false,
				verifyIdentity: false,
			});

			const result = await node.execute.call(fn);

			// Should have made 3 HTTP calls: download + create + invite-bulk
			expect(mockHttpRequest).toHaveBeenCalledTimes(3);

			// First call: download the PDF
			expect(mockHttpRequest).toHaveBeenNthCalledWith(1, expect.objectContaining({
				method: 'GET',
				url: 'https://example.com/contract.pdf',
				encoding: 'arraybuffer',
			}));

			// Second call: POST to V2 documents endpoint (create only, no invitations)
			const postCall = mockHttpRequest.mock.calls[1][0];
			expect(postCall.method).toBe('POST');
			expect(postCall.url).toBe('https://api.allsign.io/v2/documents/');
			expect(postCall.headers).toEqual({ Authorization: 'Bearer allsign_live_sk_test123' });

			// Verify V2 body structure — config always has sendInvitations:false (invitations are sent via invite-bulk)
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
			expect(body.config).toEqual({
				sendInvitations: false,
				sendByEmail: false,
				sendByWhatsapp: false,
				startAtStep: 2,
			});

			// Third call: invite-bulk
			const inviteCall = mockHttpRequest.mock.calls[2][0];
			expect(inviteCall.method).toBe('POST');
			expect(inviteCall.url).toBe('https://api.allsign.io/v2/documents/doc-123/invite-bulk');

			expect(result[0][0].json).toEqual(expect.objectContaining({ id: 'doc-123', name: 'Test Contract' }));
		});

		it('should set correct signatureValidation for simple type', async () => {
			const pdfBuffer = Buffer.from('simple-pdf');
			mockHttpRequest.mockResolvedValueOnce(pdfBuffer);
			mockHttpRequest.mockResolvedValueOnce({ id: 'doc-456' });

			const fn = getMockExecuteFunctions({
				resource: 'document',
				operation: 'createAndSend',
				documentName: 'Simple Doc',
				fileSource: 'url',
				fileUrl: 'https://example.com/simple.pdf',
				'signers.signerValues': [{ name: 'Jane', email: 'jane@test.com' }],
				verifyAutografa: false,
				verifyFea: false,
				verifyNom151: false,
				verifyVideo: false,
				verifyConfirmName: false,
				verifyIdentity: false,
			});

			await node.execute.call(fn);
			const postBody = mockHttpRequest.mock.calls[1][0].body;


			// signatureValidation.autografa should be false for 'simple' type
			expect(postBody.signatureValidation.autografa).toBe(false);
		});

		it('should set config to no invitations when no signers provided', async () => {
			const pdfBuffer = Buffer.from('draft-pdf');
			mockHttpRequest.mockResolvedValueOnce(pdfBuffer);
			mockHttpRequest.mockResolvedValueOnce({ id: 'doc-draft' });

			const fn = getMockExecuteFunctions({
				resource: 'document',
				operation: 'createAndSend',
				documentName: 'Draft Doc',
				fileSource: 'url',
				fileUrl: 'https://example.com/draft.pdf',
				'signers.signerValues': [],
				verifyAutografa: false,
				verifyFea: false,
				verifyNom151: false,
				verifyVideo: false,
				verifyConfirmName: false,
				verifyIdentity: false,
			});

			await node.execute.call(fn);
			const postBody = mockHttpRequest.mock.calls[1][0].body;
			expect(postBody.config).toEqual({
				sendInvitations: false,
				sendByEmail: false,
				sendByWhatsapp: false,
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
			// First call: POST to /v2/documents/ → returns response with id
			mockHttpRequest.mockResolvedValueOnce({ id: 'doc-bin', name: 'Binary Upload' });
			// Second call: POST to /v2/documents/doc-bin/invite-bulk
			mockHttpRequest.mockResolvedValueOnce({ invited: 1 });

			const fn = getMockExecuteFunctions({
				resource: 'document',
				operation: 'createAndSend',
				documentName: 'Binary Upload',
				fileSource: 'binary',
				binaryProperty: 'data',
				'signers.signerValues': [{ name: 'Bob', email: 'bob@test.com' }],
				verifyAutografa: false,
				verifyFea: false,
				verifyNom151: false,
				verifyVideo: false,
				verifyConfirmName: false,
				verifyIdentity: false,
			});

			const result = await node.execute.call(fn);

			// Should make 2 HTTP calls: create + invite-bulk (no download needed for binary)
			expect(mockHttpRequest).toHaveBeenCalledTimes(2);

			const postCall = mockHttpRequest.mock.calls[0][0];
			expect(postCall.method).toBe('POST');
			expect(postCall.url).toBe('https://api.allsign.io/v2/documents/');

			// Verify V2 body structure
			const body = postCall.body;
			expect(body.document).toEqual({
				base64Content: binaryBuffer.toString('base64'),
				name: 'contract.pdf',
			});
			expect(body.participants).toEqual([{ name: 'Bob', email: 'bob@test.com' }]);

			// Second call: invite-bulk
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
				resource: 'document',
				operation: 'createAndSend',
				documentName: 'Unnamed Doc',
				fileSource: 'binary',
				binaryProperty: 'data',
				'signers.signerValues': [],
				verifyAutografa: false,
				verifyFea: false,
				verifyNom151: false,
				verifyVideo: false,
				verifyConfirmName: false,
				verifyIdentity: false,
			});

			await node.execute.call(fn);
			const body = mockHttpRequest.mock.calls[0][0].body;
			expect(body.document.name).toBe('document.pdf');
		});
	});

	// ----------------------------------------------------------
	// Signature Validation (V2 Schema)
	// ----------------------------------------------------------
	describe('Signature Validation', () => {
		it('should set signatureValidation fields based on toggles', async () => {
			const pdfBuffer = Buffer.from('pdf');
			mockHttpRequest.mockResolvedValueOnce(pdfBuffer);
			mockHttpRequest.mockResolvedValueOnce({ id: 'doc-ver' });

			const fn = getMockExecuteFunctions({
				resource: 'document',
				operation: 'createAndSend',
				documentName: 'Verified Doc',
				fileSource: 'url',
				fileUrl: 'https://example.com/doc.pdf',
				'signers.signerValues': [{ name: 'Test', email: 'test@test.com' }],
				verifyAutografa: true,
				verifyFea: true,
				verifyNom151: true,
				verifyVideo: false,
				verifyConfirmName: true,
				verifyIdentity: false,
			});

			await node.execute.call(fn);
			const body = mockHttpRequest.mock.calls[1][0].body;
			expect(body.signatureValidation).toEqual({
				autografa: true,
				FEA: true,
				nom151: true,
				biometric_signature: false,
				confirm_name_to_finish: true,
			});
		});

		it('should set ai_verification when identity sub-options are enabled', async () => {
			const pdfBuffer = Buffer.from('pdf');
			mockHttpRequest.mockResolvedValueOnce(pdfBuffer);
			mockHttpRequest.mockResolvedValueOnce({ id: 'doc-id' });

			const fn = getMockExecuteFunctions({
				resource: 'document',
				operation: 'createAndSend',
				documentName: 'Identity Doc',
				fileSource: 'url',
				fileUrl: 'https://example.com/doc.pdf',
				'signers.signerValues': [{ name: 'Test', email: 'test@test.com' }],
				verifyAutografa: true,
				verifyFea: false,
				verifyNom151: false,
				verifyVideo: false,
				verifyConfirmName: false,
				verifyIdentity: true,
				verifyIdScan: true,
				verifyBiometricSelfie: true,
				verifySynthId: true,
			});

			await node.execute.call(fn);
			const body = mockHttpRequest.mock.calls[1][0].body;
			expect(body.signatureValidation.ai_verification).toBe(true);
		});

		it('should not include ai_verification when identity is disabled', async () => {
			const pdfBuffer = Buffer.from('pdf');
			mockHttpRequest.mockResolvedValueOnce(pdfBuffer);
			mockHttpRequest.mockResolvedValueOnce({ id: 'doc-noid' });

			const fn = getMockExecuteFunctions({
				resource: 'document',
				operation: 'createAndSend',
				documentName: 'No Identity Doc',
				fileSource: 'url',
				fileUrl: 'https://example.com/doc.pdf',
				'signers.signerValues': [{ name: 'Test', email: 'test@test.com' }],
				verifyAutografa: false,
				verifyFea: false,
				verifyNom151: false,
				verifyVideo: false,
				verifyConfirmName: false,
				verifyIdentity: false,
			});

			await node.execute.call(fn);
			const body = mockHttpRequest.mock.calls[1][0].body;
			expect(body.signatureValidation).not.toHaveProperty('ai_verification');
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
			// Third call: invite-bulk
			mockHttpRequest.mockResolvedValueOnce({ invited: 3 });

			const fn = getMockExecuteFunctions({
				resource: 'document',
				operation: 'createAndSend',
				documentName: 'Multi-Signer Doc',
				fileSource: 'url',
				fileUrl: 'https://example.com/doc.pdf',
				'signers.signerValues': [
					{ name: 'Alice', email: 'alice@test.com' },
					{ name: 'Bob', email: 'bob@test.com' },
					{ name: 'Charlie', email: 'charlie@test.com' },
				],
				verifyAutografa: false,
				verifyFea: false,
				verifyNom151: false,
				verifyVideo: false,
				verifyConfirmName: false,
				verifyIdentity: false,
			});

			const result = await node.execute.call(fn);
			const body = mockHttpRequest.mock.calls[1][0].body;
			expect(body.participants).toHaveLength(3);
			expect(body.participants).toEqual([
				{ name: 'Alice', email: 'alice@test.com' },
				{ name: 'Bob', email: 'bob@test.com' },
				{ name: 'Charlie', email: 'charlie@test.com' },
			]);
			// Create step always sets sendInvitations:false; invitations sent via invite-bulk
			expect(body.config.sendInvitations).toBe(false);
			expect(body.config.startAtStep).toBe(2);

			// Verify invite-bulk was called
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
				resource: 'document',
				operation: 'createAndSend',
				documentName: 'Auth Test',
				fileSource: 'url',
				fileUrl: 'https://example.com/doc.pdf',
				'signers.signerValues': [{ name: 'Test', email: 'test@test.com' }],
				verifyAutografa: false,
				verifyFea: false,
				verifyNom151: false,
				verifyVideo: false,
				verifyConfirmName: false,
				verifyIdentity: false,
			});

			await node.execute.call(fn);
			// The POST call (2nd) should have Bearer auth
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
				resource: 'document',
				operation: 'createAndSend',
				documentName: 'Slash Test',
				fileSource: 'url',
				fileUrl: 'https://example.com/doc.pdf',
				'signers.signerValues': [{ name: 'Test', email: 'test@test.com' }],
				verifyAutografa: false,
				verifyFea: false,
				verifyNom151: false,
				verifyVideo: false,
				verifyConfirmName: false,
				verifyIdentity: false,
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
				resource: 'document',
				operation: 'createAndSend',
				documentName: 'Dev Doc',
				fileSource: 'url',
				fileUrl: 'https://example.com/doc.pdf',
				'signers.signerValues': [{ name: 'Test', email: 'test@test.com' }],
				verifyAutografa: false,
				verifyFea: false,
				verifyNom151: false,
				verifyVideo: false,
				verifyConfirmName: false,
				verifyIdentity: false,
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
			// Download succeeds, POST fails
			mockHttpRequest.mockResolvedValueOnce(Buffer.from('pdf'));
			mockHttpRequest.mockRejectedValueOnce({
				response: { data: { message: 'Insufficient credits' }, status: 402 },
			});

			const fn = getMockExecuteFunctions({
				resource: 'document',
				operation: 'createAndSend',
				documentName: 'Error Doc',
				fileSource: 'url',
				fileUrl: 'https://example.com/doc.pdf',
				'signers.signerValues': [{ name: 'Test', email: 'test@test.com' }],
				verifyAutografa: false,
				verifyFea: false,
				verifyNom151: false,
				verifyVideo: false,
				verifyConfirmName: false,
				verifyIdentity: false,
			});

			await expect(node.execute.call(fn)).rejects.toThrow('AllSign API Error: Insufficient credits');
		});

		it('should throw when file download fails', async () => {
			mockHttpRequest.mockRejectedValueOnce(new Error('File not found'));

			const fn = getMockExecuteFunctions({
				resource: 'document',
				operation: 'createAndSend',
				documentName: 'Bad URL Doc',
				fileSource: 'url',
				fileUrl: 'https://example.com/nonexistent.pdf',
				'signers.signerValues': [{ name: 'Test', email: 'test@test.com' }],
				verifyAutografa: false,
				verifyFea: false,
				verifyNom151: false,
				verifyVideo: false,
				verifyConfirmName: false,
				verifyIdentity: false,
			});

			await expect(node.execute.call(fn)).rejects.toThrow('AllSign API Error');
		});

		it('should continue on fail when enabled', async () => {
			mockHttpRequest.mockRejectedValueOnce(new Error('Connection refused'));

			const fn = getMockExecuteFunctions({
				resource: 'document',
				operation: 'createAndSend',
				documentName: 'Fail Doc',
				fileSource: 'url',
				fileUrl: 'https://example.com/doc.pdf',
				'signers.signerValues': [],
				verifyAutografa: false,
				verifyFea: false,
				verifyNom151: false,
				verifyVideo: false,
				verifyConfirmName: false,
				verifyIdentity: false,
			});
			(fn as any).continueOnFail = () => true;

			const result = await node.execute.call(fn);
			expect(result[0][0].json).toHaveProperty('error', 'Connection refused');
		});
	});
});
