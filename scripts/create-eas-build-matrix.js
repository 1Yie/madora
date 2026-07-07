#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import process from 'node:process';

const platform = process.env.PLATFORM ?? 'android';
const profile = process.env.PROFILE ?? 'preview';
const androidAbi = process.env.ANDROID_ABI ?? 'all';
const desktopVersion = JSON.parse(
	fs.readFileSync('package.json', 'utf8')
).version;
const mobileVersion = JSON.parse(
	fs.readFileSync(path.join('app', 'package.json'), 'utf8')
).version;

const ANDROID_ABIS = ['arm64-v8a', 'armeabi-v7a', 'x86_64'];

function githubOutput(name, value) {
	fs.appendFileSync(process.env.GITHUB_OUTPUT, `${name}=${value}\n`, 'utf8');
}

function getAndroidAbis() {
	if (profile === 'production') return ['aab'];
	if (androidAbi === 'all') return ANDROID_ABIS;
	if (androidAbi === 'universal') return ['universal'];
	if (ANDROID_ABIS.includes(androidAbi)) return [androidAbi];

	throw new Error(`Unsupported Android ABI: ${androidAbi}`);
}

function getAndroidProfile(abi) {
	if (abi === 'aab' || abi === 'universal') return profile;
	return `${profile}-${abi}`;
}

function getAndroidArtifactExtension(abi) {
	return abi === 'aab' ? 'aab' : 'apk';
}

function getIosArtifactExtension() {
	return profile === 'preview' ? 'tar.gz' : 'ipa';
}

function addAndroidBuilds(builds) {
	for (const abi of getAndroidAbis()) {
		const extension = getAndroidArtifactExtension(abi);
		const artifactSlug =
			abi === 'aab'
				? `madora-mobile-${mobileVersion}-android-production`
				: `madora-mobile-${mobileVersion}-android-${abi}`;

		builds.push({
			artifact_name: `${artifactSlug}.${extension}`,
			artifact_slug: artifactSlug,
			name: abi === 'aab' ? 'Android production AAB' : `Android ${abi} APK`,
			platform: 'android',
			profile: getAndroidProfile(abi),
		});
	}
}

function addIosBuild(builds) {
	const extension = getIosArtifactExtension();
	const label = profile === 'preview' ? 'simulator' : profile;
	const artifactSlug = `madora-mobile-${mobileVersion}-ios-${label}`;

	builds.push({
		artifact_name: `${artifactSlug}.${extension}`,
		artifact_slug: artifactSlug,
		name: `iOS ${label}`,
		platform: 'ios',
		profile,
	});
}

const builds = [];
if (platform === 'android' || platform === 'all') {
	addAndroidBuilds(builds);
}
if (platform === 'ios' || platform === 'all') {
	addIosBuild(builds);
}

if (builds.length === 0) {
	throw new Error(`Unsupported platform: ${platform}`);
}

githubOutput('matrix', JSON.stringify({ include: builds }));
githubOutput('release_tag', `v${desktopVersion}`);
githubOutput(
	'release_name',
	`Madora Desktop ${desktopVersion} | Mobile ${mobileVersion}`
);
