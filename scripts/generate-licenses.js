/**
 * Generates src/assets/licenses.json from npm + Cargo dependencies.
 *
 * Usage:
 *   npx license-checker --json --production > /tmp/frontend-licenses.json
 *   node scripts/generate-licenses.js
 */

import { execSync } from 'node:child_process';
import { existsSync, writeFileSync, readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const TOML_ROOT = resolve(ROOT, 'src-tauri');

function cleanUrl(url) {
	if (!url) return null;
	return url
		.replace(/^git\+/, '')
		.replace(/\.git$/, '')
		.replace(/\/$/, '');
}

// ── 1. Frontend (npm via license-checker) ──

const npmPkg = JSON.parse(readFileSync(resolve(ROOT, 'package.json'), 'utf8'));
const npmDirect = new Set(Object.keys(npmPkg.dependencies ?? {}));

const frontendJson = '/tmp/frontend-licenses.json';
const frontendEntries = [];

if (!existsSync(frontendJson)) {
	console.error('frontend-licenses.json not found. Run:');
	console.error(
		'  npx license-checker --json --production > /tmp/frontend-licenses.json'
	);
	process.exit(1);
}

for (const [key, info] of Object.entries(
	JSON.parse(readFileSync(frontendJson, 'utf8'))
)) {
	const name = key.startsWith('@')
		? key.slice(0, key.lastIndexOf('@'))
		: key.slice(0, key.indexOf('@'));
	if (!npmDirect.has(name)) continue;
	frontendEntries.push({
		name,
		license:
			typeof info.licenses === 'string'
				? info.licenses
				: info.licenses?.join(' / ') || 'Unknown',
		url: cleanUrl(info.repository) ?? `https://www.npmjs.com/package/${name}`,
	});
}

// ── 2. Rust (Cargo via cargo metadata) ──

function cargoDirectDepsSet() {
	const text = readFileSync(resolve(TOML_ROOT, 'Cargo.toml'), 'utf8');
	const names = new Set();
	let inDeps = false;
	for (const line of text.split('\n')) {
		const s = line.trim();
		if (s.startsWith('[') && s.endsWith(']')) {
			inDeps = s.endsWith('dependencies]');
			continue;
		}
		if (!inDeps || !s || s.startsWith('#')) continue;
		const eq = s.indexOf('=');
		if (eq === -1) {
			names.add(s.replace(',', '').trim());
			continue;
		}
		const rawName = s.slice(0, eq).trim();
		const val = s.slice(eq + 1).trim();
		const m = val.match(/package\s*=\s*"([^"]+)"/);
		names.add(m ? m[1] : rawName);
	}
	return names;
}

const cargoDirect = cargoDirectDepsSet();
const cargoEntries = [];

try {
	const meta = JSON.parse(
		execSync('cargo metadata --format-version 1', {
			cwd: TOML_ROOT,
			encoding: 'utf8',
			maxBuffer: 64 * 1024 * 1024,
		})
	);
	const idx = new Map(meta.packages.map((p) => [p.name, p]));
	for (const name of cargoDirect) {
		if (name === 'madora') continue;
		const info = idx.get(name);
		if (!info) {
			console.warn('  skip: ' + name + ' not in cargo metadata');
			continue;
		}
		cargoEntries.push({
			name,
			license: info.license ?? 'Unknown',
			url:
				cleanUrl(info.homepage) ??
				cleanUrl(info.repository) ??
				`https://crates.io/crates/${name}`,
		});
	}
} catch (e) {
	console.warn('Warning: cargo metadata failed: ' + e.message);
}

// ── 3. Merge & deduplicate ──

const seen = new Set();
const all = [...frontendEntries, ...cargoEntries].filter((e) => {
	const k = e.name + '|' + e.license;
	if (seen.has(k)) return false;
	return seen.add(k);
});
all.sort((a, b) => a.name.localeCompare(b.name));

writeFileSync(
	resolve(ROOT, 'src', 'assets', 'licenses.json'),
	JSON.stringify(all, null, '\t') + '\n'
);
console.log(
	'Wrote ' +
		all.length +
		' entries (' +
		frontendEntries.length +
		' frontend, ' +
		cargoEntries.length +
		' rust)'
);
