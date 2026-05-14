#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import process from 'node:process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function usage() {
	console.log('Usage: bump-version.js <major|minor|patch|version>');
	console.log('Examples:');
	console.log('  node scripts/bump-version.js patch');
	console.log('  node scripts/bump-version.js 1.2.3');
}

const arg = process.argv[2];
if (!arg || arg === '-h' || arg === '--help') {
	usage();
	process.exit(0);
}

function parseSemver(v) {
	const m = String(v).match(/^([0-9]+)\.([0-9]+)\.([0-9]+)(.*)$/);
	if (!m) return null;
	return {
		major: Number(m[1]),
		minor: Number(m[2]),
		patch: Number(m[3]),
		rest: m[4] || '',
	};
}

function computeNewVersion(oldVersion, spec) {
	if (spec === 'major' || spec === 'minor' || spec === 'patch') {
		const parsed = parseSemver(oldVersion);
		if (!parsed)
			throw new Error(`Current version '${oldVersion}' is not semver`);
		let { major, minor, patch } = parsed;
		if (spec === 'major') {
			major += 1;
			minor = 0;
			patch = 0;
		} else if (spec === 'minor') {
			minor += 1;
			patch = 0;
		} else {
			patch += 1;
		}
		return `${major}.${minor}.${patch}`;
	}

	// explicit version
	if (!/^\d+\.\d+\.\d+([+-].*)?$/.test(spec)) {
		throw new Error(`Provided version '${spec}' is not a valid semver`);
	}
	return spec;
}

const repoRoot = path.resolve(__dirname, '..');
const packageJsonPath = path.join(repoRoot, 'package.json');
const tauriConfPath = path.join(repoRoot, 'src-tauri', 'tauri.conf.json');
const cargoTomlPath = path.join(repoRoot, 'src-tauri', 'Cargo.toml');

// Read package.json
const pkgRaw = fs.readFileSync(packageJsonPath, 'utf8');
const pkg = JSON.parse(pkgRaw);
const oldPkgVersion = pkg.version;

let newVersion;
try {
	newVersion = computeNewVersion(oldPkgVersion, arg);
} catch (err) {
	console.error('Error:', err.message);
	usage();
	process.exit(1);
}

if (newVersion === oldPkgVersion) {
	console.log(`Version unchanged: ${newVersion}`);
	process.exit(0);
}

// Update package.json
pkg.version = newVersion;
fs.writeFileSync(packageJsonPath, JSON.stringify(pkg, null, 2) + '\n', 'utf8');

// Update tauri.conf.json if present
if (fs.existsSync(tauriConfPath)) {
	try {
		const tauriRaw = fs.readFileSync(tauriConfPath, 'utf8');
		const tauri = JSON.parse(tauriRaw);
		tauri.version = newVersion;
		fs.writeFileSync(
			tauriConfPath,
			JSON.stringify(tauri, null, 2) + '\n',
			'utf8'
		);
	} catch (err) {
		console.warn(`Warning: failed to update ${tauriConfPath}: ${err.message}`);
	}
} else {
	console.warn(`Warning: ${tauriConfPath} not found, skipping`);
}

// Update Cargo.toml version in [package] section
if (fs.existsSync(cargoTomlPath)) {
	try {
		const cargoRaw = fs.readFileSync(cargoTomlPath, 'utf8');
		const lines = cargoRaw.split(/\r?\n/);
		const pkgIndex = lines.findIndex((l) => l.trim() === '[package]');
		if (pkgIndex === -1) {
			console.warn(
				`Warning: [package] section not found in ${cargoTomlPath}, skipping`
			);
		} else {
			let replaced = false;
			for (let i = pkgIndex + 1; i < lines.length; i++) {
				const line = lines[i];
				if (/^\s*\[.*\]\s*$/.test(line)) break; // next section
				const m = line.match(/^\s*version\s*=\s*"(.*)"\s*$/);
				if (m) {
					lines[i] = line.replace(
						/version\s*=\s*".*"/,
						`version = "${newVersion}"`
					);
					replaced = true;
					break;
				}
			}
			if (!replaced) {
				console.warn(
					`Warning: version key not found under [package] in ${cargoTomlPath}, skipping`
				);
			} else {
				fs.writeFileSync(cargoTomlPath, lines.join('\n') + '\n', 'utf8');
			}
		}
	} catch (err) {
		console.warn(`Warning: failed to update ${cargoTomlPath}: ${err.message}`);
	}
} else {
	console.warn(`Warning: ${cargoTomlPath} not found, skipping`);
}

console.log(`Bumped version: ${oldPkgVersion} -> ${newVersion}`);
console.log(`Updated files:`);
console.log(`  - ${packageJsonPath}`);
if (fs.existsSync(tauriConfPath)) console.log(`  - ${tauriConfPath}`);
if (fs.existsSync(cargoTomlPath)) console.log(`  - ${cargoTomlPath}`);
