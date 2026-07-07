#!/usr/bin/env node
import { Buffer } from 'node:buffer';
import fs from 'fs';
import path from 'path';
import process from 'node:process';

const [, , jsonPath, outputDir, artifactName] = process.argv;

if (!jsonPath || !outputDir || !artifactName) {
	console.error(
		'Usage: download-eas-artifact.js <eas-build-json> <output-dir> <artifact-name>'
	);
	process.exit(1);
}

function findArtifactUrl(value) {
	if (!value || typeof value !== 'object') return null;

	if (Array.isArray(value)) {
		for (const item of value) {
			const found = findArtifactUrl(item);
			if (found) return found;
		}
		return null;
	}

	const artifacts = value.artifacts;
	if (artifacts && typeof artifacts === 'object') {
		for (const key of ['buildUrl', 'applicationArchiveUrl']) {
			if (
				typeof artifacts[key] === 'string' &&
				artifacts[key].startsWith('http')
			) {
				return artifacts[key];
			}
		}
	}

	for (const key of ['artifactUrl', 'buildUrl', 'applicationArchiveUrl']) {
		if (typeof value[key] === 'string' && value[key].startsWith('http')) {
			return value[key];
		}
	}

	for (const child of Object.values(value)) {
		const found = findArtifactUrl(child);
		if (found) return found;
	}

	return null;
}

const raw = fs.readFileSync(jsonPath, 'utf8').trim();
const parsed = JSON.parse(raw);
const artifactUrl = findArtifactUrl(parsed);

if (!artifactUrl) {
	console.error(`Unable to find EAS artifact URL in ${jsonPath}`);
	process.exit(1);
}

fs.mkdirSync(outputDir, { recursive: true });
const outputPath = path.join(outputDir, artifactName);
if (typeof globalThis.fetch !== 'function') {
	throw new Error('This script requires Node.js with fetch support');
}

const response = await globalThis.fetch(artifactUrl);

if (!response.ok) {
	throw new Error(`Failed to download EAS artifact: HTTP ${response.status}`);
}

const bytes = Buffer.from(await response.arrayBuffer());
fs.writeFileSync(outputPath, bytes);
console.log(`Downloaded ${artifactName}`);
