import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

// Ensure the mado binary placeholder exists for Tauri bundler's resources config.
// This is needed because the bundler needs the file at build time, but the actual
// binary may be produced by a separate build step (madora-cli) or may not exist yet.

const target = join('src-tauri', 'target', 'release', 'mado');

if (!existsSync(target)) {
	mkdirSync(dirname(target), { recursive: true });
	writeFileSync(target, '');
}
