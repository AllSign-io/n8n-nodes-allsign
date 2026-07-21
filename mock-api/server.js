const http = require('http');
const crypto = require('crypto');

const PORT = 3333;

const server = http.createServer((req, res) => {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, Idempotency-Key');
  res.setHeader('Content-Type', 'application/json');

  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  const auth = req.headers['authorization'];
  if (!auth || !auth.startsWith('Bearer ')) {
    res.writeHead(401);
    res.end(JSON.stringify({ detail: 'Missing or invalid Authorization header' }));
    return;
  }

  const url = new URL(req.url, `http://localhost:${PORT}`);

  // GET /v3/documents — credential test (list, read-only)
  if (req.method === 'GET' && url.pathname === '/v3/documents') {
    res.writeHead(200);
    res.end(JSON.stringify({
      object: 'list',
      data: [],
      hasMore: false,
      nextCursor: null,
      previousCursor: null,
      limit: Number(url.searchParams.get('limit') || 20),
    }));
    return;
  }

  // POST /v3/documents — create (single call: source + signers + signatureValidation inline)
  if (req.method === 'POST' && url.pathname === '/v3/documents') {
    let body = '';
    req.on('data', (chunk) => { body += chunk; });
    req.on('end', () => {
      let parsed = {};
      try { parsed = JSON.parse(body); } catch (e) { /* noop */ }

      const docId = `doc-${crypto.randomUUID ? crypto.randomUUID() : Date.now()}`;
      const signerCount = Array.isArray(parsed.signers) ? parsed.signers.length : 0;
      const now = new Date().toISOString();

      const response = {
        id: docId,
        object: 'document',
        name: parsed.name || (parsed.file && parsed.file.name) || 'Document',
        status: signerCount > 0 ? 'awaiting_signatures' : 'draft',
        documentType: parsed.source === 'template' ? 'template' : 'editable',
        signerCount,
        signedCount: 0,
        ownerId: '623d9e59-86e0-4f7b-bca2-161e66b81624',
        orgId: null,
        folderId: null,
        expiresAt: parsed.expiresAt || null,
        expirationReminders: null,
        createdAt: now,
        updatedAt: now,
      };

      console.log(`Document created: "${response.name}" (source=${parsed.source || 'file'}) with ${signerCount} signer(s)`);
      res.writeHead(201);
      res.end(JSON.stringify(response));
    });
    return;
  }

  // Fallback
  res.writeHead(404);
  res.end(JSON.stringify({ detail: 'Not found' }));
});

server.listen(PORT, () => {
  console.log(`\nAllSign Mock API (v3) running on http://localhost:${PORT}`);
  console.log(`   Credential test: GET  http://localhost:${PORT}/v3/documents?limit=1`);
  console.log(`   Create doc:      POST http://localhost:${PORT}/v3/documents\n`);
});
