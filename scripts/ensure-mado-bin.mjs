import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

const profile = process.argv[2] === 'debug' ? 'debug' : 'release';
const cargoProfileArg = profile === 'release' ? ['--release'] : [];
const manifestPath = join('src-tauri', 'Cargo.toml');

// Build the current platform binary only when it is missing or still a zero-byte
// placeholder. This preserves prebuilt release artifacts from CI, including the
// universal macOS CLI assembled in release.yml.

const outputDir = join('src-tauri', 'target', profile);
const platformBinary = process.platform === 'win32' ? 'mado.exe' : 'mado';
const resourceFiles =
	profile === 'release' ? ['mado', 'mado.exe'] : [platformBinary];

const builtBinary = join(outputDir, platformBinary);

if (!isUsableBinary(builtBinary)) {
	const result = spawnSync(
		'cargo',
		[
			'build',
			'--manifest-path',
			manifestPath,
			'-p',
			'madora-cli',
			...cargoProfileArg,
		],
		{
			cwd: process.cwd(),
			stdio: 'inherit',
		}
	);

	if (result.status !== 0) {
		throw new Error(`Failed to build madora-cli for ${profile}.`);
	}
	if (!isUsableBinary(builtBinary)) {
		throw new Error(`Expected built CLI binary at ${builtBinary}.`);
	}
}

for (const file of resourceFiles) {
	const target = join(outputDir, file);
	if (!existsSync(target)) {
		mkdirSync(dirname(target), { recursive: true });
		writeFileSync(target, '');
	}
}

function isUsableBinary(path) {
	if (!existsSync(path)) {
		return false;
	}

	const stat = statSync(path);
	return stat.isFile() && stat.size > 0;
}
