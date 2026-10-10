#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const ESCANER = '@n8n/scan-community-package@0.38.0';

// El escáner se instala en una carpeta aparte y no en node_modules del repo:
// arrastra su propia versión de TypeScript y deja el build de aquí sin compilar.
const casa = mkdtempSync(join(tmpdir(), 'allsign-escaner-'));
execFileSync('npm', ['i', '--prefix', casa, '--no-package-lock', '--silent', ESCANER], {
	stdio: 'inherit',
});
const { analyzePackage } = await import(
	pathToFileURL(join(casa, 'node_modules/@n8n/scan-community-package/scanner/scanner.mjs')).href
);

// Compila antes de empaquetar: con un dist viejo el escáner reporta sobre
// código que ya no existe, y la primera vez me dio dos errores fantasma.
execFileSync('npm', ['run', 'build'], { stdio: 'inherit' });

const paquete = mkdtempSync(join(tmpdir(), 'allsign-paquete-'));
const tgz = execFileSync('npm', ['pack', '--silent'], { encoding: 'utf8' }).trim().split('\n').pop();
execFileSync('tar', ['xzf', tgz, '-C', paquete, '--strip-components=1']);
rmSync(tgz);

const limpiar = () => {
	rmSync(casa, { recursive: true, force: true });
	rmSync(paquete, { recursive: true, force: true });
};

if (!readdirSync(paquete, { recursive: true }).some((f) => String(f).endsWith('.js'))) {
	limpiar();
	console.error('El paquete salió sin código. El escáner aprueba lo que no puede leer, así que esto es un fallo.');
	process.exit(1);
}

const r = await analyzePackage(paquete);
limpiar();

if (!r.passed) {
	console.error(r.message);
	if (r.details) console.error(r.details);
	process.exit(1);
}
console.log('El paquete pasa el escáner de n8n.');
