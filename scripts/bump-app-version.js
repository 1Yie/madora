#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import process from 'node:process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function usage() {
	console.log('Usage: bump-app-version.js <major|minor|patch|version>');
	console.log('Examples:');
	console.log('  node scripts/bump-app-version.js patch');
	console.log('  node scripts/bump-app-version.js 0.0.2');
}

const arg = process.argv[2];
if (!arg || arg === '-h' || arg === '--help') {
	usage();
	process.exit(0);
}

function parseSemver(version) {
	const match = String(version).match(/^([0-9]+)\.([0-9]+)\.([0-9]+)(.*)$/);
	if (!match) return null;

	return {
		major: Number(match[1]),
		minor: Number(match[2]),
		patch: Number(match[3]),
		rest: match[4] || '',
	};
}

function computeNewVersion(oldVersion, spec) {
	if (spec === 'major' || spec === 'minor' || spec === 'patch') {
		const parsed = parseSemver(oldVersion);
		if (!parsed) {
			throw new Error(`Current app version '${oldVersion}' is not semver`);
		}

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

	if (!/^\d+\.\d+\.\d+([+-].*)?$/.test(spec)) {
		throw new Error(`Provided app version '${spec}' is not a valid semver`);
	}

	return spec;
}

function readJson(filePath) {
	return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function writeJson(filePath, value) {
	fs.writeFileSync(filePath, JSON.stringify(value, null, '\t') + '\n', 'utf8');
	updatedFiles.add(filePath);
}

function writeText(filePath, value) {
	fs.writeFileSync(filePath, value, 'utf8');
	updatedFiles.add(filePath);
}

function readAndroidGradleVersionInfo(filePath) {
	if (!fs.existsSync(filePath)) {
		return { versionCode: null, versionName: null };
	}

	const raw = fs.readFileSync(filePath, 'utf8');
	const versionCodeMatch = raw.match(/^\s*versionCode\s+(\d+)\s*$/m);
	const versionNameMatch = raw.match(/^\s*versionName\s+"([^"]*)"\s*$/m);

	return {
		versionCode: versionCodeMatch ? Number(versionCodeMatch[1]) : null,
		versionName: versionNameMatch ? versionNameMatch[1] : null,
	};
}

function updateAndroidGradle(filePath, newVersion, versionCode) {
	if (!fs.existsSync(filePath)) {
		console.warn(`Warning: ${filePath} not found, skipping`);
		return;
	}

	try {
		const raw = fs.readFileSync(filePath, 'utf8');
		let next = raw;
		let replacedVersionCode = false;
		let replacedVersionName = false;

		next = next.replace(
			/^(\s*versionCode\s+)\d+(\s*)$/m,
			(_match, prefix, suffix) => {
				replacedVersionCode = true;
				return `${prefix}${versionCode}${suffix}`;
			}
		);
		next = next.replace(
			/^(\s*versionName\s+)"[^"]*"(\s*)$/m,
			(_match, prefix, suffix) => {
				replacedVersionName = true;
				return `${prefix}"${newVersion}"${suffix}`;
			}
		);

		if (!replacedVersionCode) {
			console.warn(
				`Warning: versionCode not found in ${filePath}, skipping versionCode`
			);
		}
		if (!replacedVersionName) {
			console.warn(
				`Warning: versionName not found in ${filePath}, skipping versionName`
			);
		}
		if (next !== raw) {
			writeText(filePath, next);
		}
	} catch (err) {
		console.warn(`Warning: failed to update ${filePath}: ${err.message}`);
	}
}

const repoRoot = path.resolve(__dirname, '..');
const appPackageJsonPath = path.join(repoRoot, 'app', 'package.json');
const appJsonPath = path.join(repoRoot, 'app', 'app.json');
const androidGradlePath = path.join(
	repoRoot,
	'app',
	'android',
	'app',
	'build.gradle'
);
const updatedFiles = new Set();

let appPackage = null;
let appConfig = null;

if (fs.existsSync(appPackageJsonPath)) {
	appPackage = readJson(appPackageJsonPath);
}

if (fs.existsSync(appJsonPath)) {
	appConfig = readJson(appJsonPath);
}

const oldVersion =
	appPackage?.version ??
	appConfig?.expo?.android?.version ??
	appConfig?.expo?.version;

if (!oldVersion) {
	console.error('Error: unable to resolve current app version');
	process.exit(1);
}

let newVersion;
try {
	newVersion = computeNewVersion(oldVersion, arg);
} catch (err) {
	console.error('Error:', err.message);
	usage();
	process.exit(1);
}

const androidGradleVersionInfo =
	readAndroidGradleVersionInfo(androidGradlePath);
const appConfigVersionCode = appConfig?.expo?.android?.versionCode;
const androidVersionCodes = [
	androidGradleVersionInfo.versionCode,
	Number.isInteger(appConfigVersionCode) ? appConfigVersionCode : null,
].filter((value) => Number.isInteger(value) && value > 0);
const currentAndroidVersionCode = androidVersionCodes.length
	? Math.max(...androidVersionCodes)
	: 0;
const versionChanged = newVersion !== oldVersion;
const nextAndroidVersionCode = versionChanged
	? currentAndroidVersionCode + 1
	: currentAndroidVersionCode || 1;

if (appPackage && appPackage.version !== newVersion) {
	appPackage.version = newVersion;
	writeJson(appPackageJsonPath, appPackage);
}

if (appConfig) {
	appConfig.expo ??= {};
	appConfig.expo.android ??= {};

	let changed = false;

	if (appConfig.expo.version !== newVersion) {
		appConfig.expo.version = newVersion;
		changed = true;
	}

	// Expo android.version overrides root version when present.
	if (
		typeof appConfig.expo.android.version === 'string' &&
		appConfig.expo.android.version !== newVersion
	) {
		appConfig.expo.android.version = newVersion;
		changed = true;
	}

	if (appConfig.expo.android.versionCode !== nextAndroidVersionCode) {
		appConfig.expo.android.versionCode = nextAndroidVersionCode;
		changed = true;
	}

	if (changed) {
		writeJson(appJsonPath, appConfig);
	}
}

updateAndroidGradle(androidGradlePath, newVersion, nextAndroidVersionCode);

if (versionChanged) {
	console.log(`Bumped app version: ${oldVersion} -> ${newVersion}`);
} else {
	console.log(`App version unchanged: ${newVersion}`);
}
console.log(
	`Android versionCode: ${currentAndroidVersionCode || 'none'} -> ${nextAndroidVersionCode}`
);

if (updatedFiles.size > 0) {
	console.log('Updated files:');
	for (const filePath of updatedFiles) {
		console.log(`  - ${filePath}`);
	}
} else {
	console.log('No app files needed updates.');
}
