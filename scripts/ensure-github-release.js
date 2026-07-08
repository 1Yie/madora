#!/usr/bin/env node
import fs from 'node:fs';
import process from 'node:process';

const apiBase = 'https://api.github.com';
const token = process.env.GITHUB_TOKEN;
const repository = process.env.GITHUB_REPOSITORY;
const tagName = process.env.RELEASE_TAG;
const releaseName = process.env.RELEASE_NAME;
const releaseBody = process.env.RELEASE_BODY ?? '';
const targetCommitish = process.env.TARGET_COMMITISH;
const draft = process.env.RELEASE_DRAFT !== 'false';
const prerelease = process.env.RELEASE_PRERELEASE === 'true';

if (!token || !repository || !tagName || !releaseName) {
	console.error(
		'GITHUB_TOKEN, GITHUB_REPOSITORY, RELEASE_TAG, and RELEASE_NAME are required'
	);
	process.exit(1);
}

async function request(path, options = {}) {
	const response = await fetch(`${apiBase}${path}`, {
		...options,
		headers: {
			Accept: 'application/vnd.github+json',
			Authorization: `Bearer ${token}`,
			...(options.body ? { 'Content-Type': 'application/json' } : {}),
			'X-GitHub-Api-Version': '2022-11-28',
			...(options.headers ?? {}),
		},
	});

	if (!response.ok) {
		const body = await response.text();
		throw new Error(
			`${options.method ?? 'GET'} ${path} failed: ${response.status} ${body}`
		);
	}

	return response.status === 204 ? null : response.json();
}

async function uploadBytes(releaseId, assetName, bytes) {
	return fetch(
		`https://uploads.github.com/repos/${repository}/releases/${releaseId}/assets?name=${encodeURIComponent(assetName)}`,
		{
			method: 'POST',
			headers: {
				Accept: 'application/vnd.github+json',
				Authorization: `Bearer ${token}`,
				'Content-Length': String(bytes.byteLength),
				'Content-Type': 'application/octet-stream',
				'X-GitHub-Api-Version': '2022-11-28',
			},
			body: bytes,
		}
	).then(async (response) => {
		if (!response.ok) {
			const body = await response.text();
			throw new Error(`Asset upload failed: ${response.status} ${body}`);
		}

		return response.json();
	});
}

async function downloadAsset(asset) {
	return fetch(asset.url, {
		headers: {
			Accept: 'application/octet-stream',
			Authorization: `Bearer ${token}`,
			'X-GitHub-Api-Version': '2022-11-28',
		},
	}).then(async (response) => {
		if (!response.ok) {
			const body = await response.text();
			throw new Error(`Asset download failed: ${response.status} ${body}`);
		}

		return Buffer.from(await response.arrayBuffer());
	});
}

async function listReleases() {
	const releases = [];
	for (let page = 1; ; page += 1) {
		const items = await request(
			`/repos/${repository}/releases?per_page=100&page=${page}`
		);
		releases.push(...items);
		if (items.length < 100) return releases;
	}
}

function writeOutput(name, value) {
	if (!process.env.GITHUB_OUTPUT) return;
	fs.appendFileSync(process.env.GITHUB_OUTPUT, `${name}=${value}\n`, 'utf8');
}

async function getReleaseAssets(releaseId) {
	return request(
		`/repos/${repository}/releases/${releaseId}/assets?per_page=100`
	);
}

async function deleteAsset(assetId) {
	await request(`/repos/${repository}/releases/assets/${assetId}`, {
		method: 'DELETE',
	});
}

async function deleteRelease(releaseId) {
	await request(`/repos/${repository}/releases/${releaseId}`, {
		method: 'DELETE',
	});
}

async function deleteTargetAssetByName(releaseId, assetName) {
	const targetAssets = await getReleaseAssets(releaseId);
	const targetAsset = targetAssets.find((asset) => asset.name === assetName);

	if (targetAsset) await deleteAsset(targetAsset.id);
}

async function mergeDuplicateDrafts(targetRelease, duplicateReleases) {
	for (const duplicateRelease of duplicateReleases) {
		if (!duplicateRelease.draft) continue;

		const duplicateAssets = await getReleaseAssets(duplicateRelease.id);

		for (const asset of duplicateAssets) {
			const assetBytes = await downloadAsset(asset);
			await deleteTargetAssetByName(targetRelease.id, asset.name);
			await uploadBytes(targetRelease.id, asset.name, assetBytes);
		}

		await deleteRelease(duplicateRelease.id);
		console.log(
			`Merged duplicate draft release ${duplicateRelease.name} (${duplicateRelease.id})`
		);
	}
}

const matchingReleases = (await listReleases()).filter(
	(release) => release.tag_name === tagName
);
const existingRelease =
	matchingReleases.find((release) => release.name === releaseName) ??
	matchingReleases[0];

const releaseIsPublished = existingRelease && !existingRelease.draft;
const payload = {
	name: releaseName,
	body: releaseBody,
	draft: releaseIsPublished ? false : draft,
	prerelease,
};

if (!existingRelease && targetCommitish)
	payload.target_commitish = targetCommitish;

const release = existingRelease
	? await request(`/repos/${repository}/releases/${existingRelease.id}`, {
			method: 'PATCH',
			body: JSON.stringify(payload),
		})
	: await request(`/repos/${repository}/releases`, {
			method: 'POST',
			body: JSON.stringify({ ...payload, tag_name: tagName }),
		});

await mergeDuplicateDrafts(
	release,
	matchingReleases.filter(
		(matchingRelease) => matchingRelease.id !== release.id
	)
);

writeOutput('id', release.id);
writeOutput('html_url', release.html_url);
writeOutput('upload_url', release.upload_url);

console.log(
	`${existingRelease ? 'Reused' : 'Created'} release ${release.name} (${release.tag_name})`
);
