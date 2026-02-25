const http = require('http');

const PORT = 3333;

const server = http.createServer((req, res) => {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
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

  // GET /v2/test/security — credential test
  if (req.method === 'GET' && req.url === '/v2/test/security') {
    res.writeHead(200);
    res.end(JSON.stringify({
      success: true,
      message: 'API V2 security validated successfully',
      authenticatedUser: 'erikasofia.garciabalderas@gmail.com',
      tenantId: '623d9e59-86e0-4f7b-bca2-161e66b81624',
      scopes: ['document:*', 'signature:*'],
      environment: 'live'
    }));
    return;
  }

  // POST /v2/documents/ — create & send document
  if (req.method === 'POST' && req.url === '/v2/documents/') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      let parsed = {};
      try { parsed = JSON.parse(body); } catch(e) {}

      const docName = parsed.document?.name || 'Document.pdf';
      const participantCount = parsed.participants?.length || 0;
      const validation = parsed.signatureValidation || {};

      // Build signature entries for each participant
      const signatures = (parsed.participants || []).map((p, i) => ({
        id: `sig-${crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${i}`}`,
        status: 'SENT',
        signer: {
          id: `user-${Date.now()}-${i}`,
          email: p.email
        }
      }));

      const response = {
        id: `doc-${Date.now()}`,
        name: docName,
        documentType: 'EDITABLE',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        ownerId: '623d9e59-86e0-4f7b-bca2-161e66b81624',
        activePublicUrl: false,
        signersData: {
          id: `state-${Date.now()}`,
          status: participantCount > 0 ? 'RECOLECTANDO_FIRMANTES' : 'BORRADOR',
          signatures
        },
        signatureValidation: {
          autografa: validation.autografa ?? true,
          FEA: validation.FEA ?? false,
          nom151: validation.nom151 ?? false,
          videofirma: validation.videofirma ?? false,
          id_scan: validation.id_scan ?? false,
          biometric_signature: validation.biometric_signature ?? false,
          confirm_name_to_finish: validation.confirm_name_to_finish ?? false,
        },
        config: parsed.config || {},
        creditsConsumed: 1
      };

      console.log(`✅ Document created: "${docName}" with ${participantCount} signer(s)`);
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
  console.log(`\n🚀 AllSign Mock API running on http://localhost:${PORT}`);
  console.log(`   Test endpoint: GET  http://localhost:${PORT}/v2/test/security`);
  console.log(`   Create doc:    POST http://localhost:${PORT}/v2/documents/\n`);
});
