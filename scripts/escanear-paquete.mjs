#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const ESCANER = '@n8n/scan-community-package@0.40.0';
const ARCHIVOS_DEL_PAQUETE = ['**/*.js', 'package.json'];

// El escáner se instala en una carpeta aparte y no en node_modules del repo:
// arrastra su propia versión de TypeScript y deja el build de aquí sin compilar.
const casa = mkdtempSync(join(tmpdir(), 'allsign-escaner-'));
const paquete = mkdtempSync(join(tmpdir(), 'allsign-paquete-'));

try {
	execFileSync('npm', ['i', '--prefix', casa, '--no-package-lock', '--ignore-scripts', ESCANER], {
		stdio: 'inherit',
	});
	const { analyzePackage, SOURCE_FILE_PATTERNS } = await import(
		pathToFileURL(join(casa, 'node_modules/@n8n/scan-community-package/scanner/scanner.mjs')).href
	);

	// Compila antes de empaquetar: con un dist viejo el escáner reporta sobre
	// código que ya no existe, y la primera vez me dio dos errores fantasma.
	execFileSync('npm', ['run', 'build'], { stdio: 'inherit' });

	const [{ filename }] = JSON.parse(
		execFileSync('npm', ['pack', '--json', '--pack-destination', paquete], { encoding: 'utf8' }),
	);
	execFileSync('tar', ['xzf', join(paquete, filename), '-C', paquete, '--strip-components=1']);

	const { n8n } = JSON.parse(readFileSync(join(paquete, 'package.json'), 'utf8'));
	const faltantes = [...n8n.nodes, ...n8n.credentials].filter(
		(archivo) => !existsSync(join(paquete, archivo)),
	);

	const revisiones = [
		['código fuente', await analyzePackage(process.cwd(), SOURCE_FILE_PATTERNS)],
		['paquete', await analyzePackage(paquete, ARCHIVOS_DEL_PAQUETE)],
	];
	const reprobadas = revisiones.filter(([, resultado]) => !resultado.passed);

	if (faltantes.length > 0) {
		console.error(
			`Al paquete le faltan archivos que declara en package.json: ${faltantes.join(', ')}. El escáner aprueba lo que no puede leer, así que esto es un fallo.`,
		);
	}
	for (const [revision, resultado] of reprobadas) {
		console.error(`${revision}: ${resultado.message}`);
		if (resultado.details) console.error(resultado.details);
	}

	if (faltantes.length > 0 || reprobadas.length > 0) {
		process.exitCode = 1;
	} else {
		console.log('El código fuente y el paquete pasan el escáner de n8n.');
	}
} finally {
	rmSync(casa, { recursive: true, force: true });
	rmSync(paquete, { recursive: true, force: true });
}
