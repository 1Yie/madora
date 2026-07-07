#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
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
lines[headingIndex] =
	`## [Desktop ${desktopVersion}](${releaseLink})（${releaseDate}） | Mobile ${mobileVersion}（${releaseDate}）`;

fs.writeFileSync(changelogPath, lines.join(lineEnding), 'utf8');
