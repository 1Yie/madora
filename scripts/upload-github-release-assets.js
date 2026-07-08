#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const token = process.env.GITHUB_TOKEN;
const repository = process.env.GITHUB_REPOSITORY;
const releaseId = process.env.RELEASE_ID;
const assets = process.argv.slice(2);

if (!token || !repository || !releaseId || assets.length === 0) {
	console.error(
		'GITHUB_TOKEN, GITHUB_REPOSITORY, RELEASE_ID, and at least one asset path are required'
	);
	process.exit(1);
}

async function request(url, options = {}) {
	const response = await fetch(url, {
		...options,
		headers: {
			Accept: 'application/vnd.github+json',
			Authorization: `Bearer ${token}`,
			'X-GitHub-Api-Version': '2022-11-28',
			...(options.headers ?? {}),
		},
	});

	if (!response.ok) {
		const body = await response.text();
		throw new Error(
			`${options.method ?? 'GET'} ${url} failed: ${response.status} ${body}`
		);
	}

	return response.status === 204 ? null : response.json();
}

async function deleteExistingAsset(assetName) {
	const existingAssets = await request(
		`https://api.github.com/repos/${repository}/releases/${releaseId}/assets?per_page=100`
	);
	const existingAsset = existingAssets.find(
		(asset) => asset.name === assetName
	);

	if (existingAsset) {
		await request(
			`https://api.github.com/repos/${repository}/releases/assets/${existingAsset.id}`,
			{ method: 'DELETE' }
		);
	}
}

for (const assetPath of assets) {
	const assetName = path.basename(assetPath);
	const bytes = await fs.readFile(assetPath);

	await deleteExistingAsset(assetName);
	await request(
		`https://uploads.github.com/repos/${repository}/releases/${releaseId}/assets?name=${encodeURIComponent(assetName)}`,
		{
			method: 'POST',
			headers: {
				'Content-Length': String(bytes.byteLength),
				'Content-Type': 'application/octet-stream',
			},
			body: bytes,
		}
	);

	console.log(`Uploaded ${assetName}`);
}
