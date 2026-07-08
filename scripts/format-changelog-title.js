#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import { execFileSync } from 'node:child_process';
import process from 'node:process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');

const changelogPath = path.join(repoRoot, 'CHANGELOG.md');
const packageJsonPath = path.join(repoRoot, 'package.json');
const appPackageJsonPath = path.join(repoRoot, 'app', 'package.json');

function readJson(filePath) {
	return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function runGit(args) {
	return execFileSync('git', args, {
		cwd: repoRoot,
		encoding: 'utf8',
		stdio: ['ignore', 'pipe', 'ignore'],
	}).trim();
}

function parseDesktopVersion(heading) {
	return (
		heading.match(/^## \[Desktop\s+([^\]\s]+)/)?.[1] ??
		heading.match(/^## \[([^\]\s]+)\]/)?.[1] ??
		null
	);
}

function findReleaseCommit(version) {
	const needle = `"version": "${version}"`;
	let candidates = [];
	try {
		candidates = runGit([
			'log',
			'--format=%H',
			'-S',
			needle,
			'--',
			'package.json',
		])
			.split('\n')
			.filter(Boolean);
	} catch {
		return null;
	}

	for (const commit of candidates) {
		try {
			const raw = runGit(['show', `${commit}:package.json`]);
			if (JSON.parse(raw).version === version) return commit;
		} catch {
			// Ignore unreadable historical package snapshots.
		}
	}

	return null;
}

function parseConventionalSubject(subject) {
	const match = subject.match(/^(feat|fix)(?:\(([^)]+)\))?!?:\s+(.+)$/);
	if (!match) return null;
	return {
		type: match[1],
		scope: match[2] ?? null,
		description: match[3],
	};
}

function collectReleaseCommits(previousVersion, currentVersion) {
	const previousCommit = findReleaseCommit(previousVersion);
	if (!previousCommit) return { features: [], fixes: [] };
	const currentCommit = findReleaseCommit(currentVersion) ?? 'HEAD';

	const output = runGit([
		'log',
		'--reverse',
		'--format=%H%x00%s',
		`${previousCommit}..${currentCommit}`,
	]);
	const features = [];
	const fixes = [];

	for (const line of output.split('\n').filter(Boolean)) {
		const [hash, subject] = line.split('\0');
		const parsed = parseConventionalSubject(subject ?? '');
		if (!hash || !parsed) continue;
		const item = { ...parsed, hash };
		if (parsed.type === 'feat') features.push(item);
		if (parsed.type === 'fix') fixes.push(item);
	}

	return { features, fixes };
}

function formatCommit(item) {
	const shortHash = item.hash.slice(0, 7);
	const scope = item.scope ? `**${item.scope}:** ` : '';
	return `- ${scope}${item.description} ([${shortHash}](https://github.com/1Yie/madora/commit/${item.hash}))`;
}

function buildReleaseSection({
	desktopVersion,
	mobileVersion,
	previousDesktopVersion,
	releaseDate,
	features,
	fixes,
}) {
	const lines = [
		`## [Desktop ${desktopVersion}](https://github.com/1Yie/madora/compare/v${previousDesktopVersion}...v${desktopVersion})（${releaseDate}） | Mobile ${mobileVersion}（${releaseDate}）`,
	];

	if (fixes.length > 0) {
		lines.push('', '### Bug Fixes', '', ...fixes.map(formatCommit));
	}

	if (features.length > 0) {
		lines.push('', '### Features', '', ...features.map(formatCommit));
	}

	if (features.length === 0 && fixes.length === 0) {
		lines.push('', 'No notable changes.');
	}

	return lines;
}

const desktopVersion = readJson(packageJsonPath).version;
const mobileVersion = readJson(appPackageJsonPath).version;

if (!desktopVersion || !mobileVersion) {
	console.error('Error: unable to resolve desktop or mobile version');
	process.exit(1);
}

const changelog = fs.readFileSync(changelogPath, 'utf8');
const lineEnding = changelog.includes('\r\n') ? '\r\n' : '\n';
const lines = changelog.split(/\r?\n/);
const headingIndex = lines.findIndex((line) => line.startsWith('## '));

if (headingIndex === -1) {
	console.error('Error: unable to find a changelog release heading');
	process.exit(1);
}

const heading = lines[headingIndex];
const linkMatch = heading.match(/^## \[[^\]]+\]\(([^)]+)\)/);
const dateMatch = heading.match(/[（(](\d{4}-\d{2}-\d{2})[）)]/);

if (!linkMatch || !dateMatch) {
	console.error(`Error: unsupported changelog heading: ${heading}`);
	process.exit(1);
}

const releaseLink = linkMatch[1];
const releaseDate = dateMatch[1];
const releaseHeadingIndexes = lines
	.map((line, index) => ({ line, index }))
	.filter(({ line }) => line.startsWith('## '));
const previousHeading = releaseHeadingIndexes.find(
	({ line, index }) =>
		index > headingIndex && parseDesktopVersion(line) !== desktopVersion
);
const previousHeadingIndex = previousHeading?.index ?? -1;

if (previousHeadingIndex === -1) {
	lines[headingIndex] =
		`## [Desktop ${desktopVersion}](${releaseLink})（${releaseDate}） | Mobile ${mobileVersion}（${releaseDate}）`;
	fs.writeFileSync(changelogPath, lines.join(lineEnding), 'utf8');
	process.exit(0);
}

const previousDesktopVersion = parseDesktopVersion(lines[previousHeadingIndex]);

if (!previousDesktopVersion) {
	console.error(
		`Error: unable to resolve previous desktop version from heading: ${lines[previousHeadingIndex]}`
	);
	process.exit(1);
}

const { features, fixes } = collectReleaseCommits(
	previousDesktopVersion,
	desktopVersion
);
const releaseSection = buildReleaseSection({
	desktopVersion,
	mobileVersion,
	previousDesktopVersion,
	releaseDate,
	features,
	fixes,
});

const nextLines = [
	...lines.slice(0, headingIndex),
	...releaseSection,
	'',
	...lines.slice(previousHeadingIndex),
];

fs.writeFileSync(changelogPath, nextLines.join(lineEnding), 'utf8');
