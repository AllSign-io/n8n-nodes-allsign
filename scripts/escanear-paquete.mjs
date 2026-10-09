#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const ESCANER = '@n8n/scan-community-package@0.38.0';
execFileSync('npm', ['i', '--no-save', '--silent', ESCANER], { stdio: 'inherit' });
const { analyzePackage } = await import('@n8n/scan-community-package/scanner/scanner.mjs');

const dir = mkdtempSync(join(tmpdir(), 'allsign-scan-'));
const tgz = execFileSync('npm', ['pack', '--silent'], { encoding: 'utf8' }).trim().split('\n').pop();
execFileSync('tar', ['xzf', tgz, '-C', dir, '--strip-components=1']);
rmSync(tgz);

const archivos = readdirSync(dir, { recursive: true });
if (!archivos.some((f) => String(f).endsWith('.js'))) {
	console.error('El paquete salió sin código. El escáner aprueba lo que no puede leer, así que esto es un fallo.');
	process.exit(1);
}

const r = await analyzePackage(dir);
rmSync(dir, { recursive: true, force: true });

if (!r.passed) {
	console.error(r.message);
	if (r.details) console.error(r.details);
	process.exit(1);
}
console.log('El paquete pasa el escáner de n8n.');
