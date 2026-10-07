import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { getProviderDefinitions } from '@/context/ai-settings-provider';

/**
 * The Rust backend resolves a provider's default API URL and model when the
 * request leaves them empty, and keys its completion cache on those values.
 * The settings UI shows its own copy, so the two lists must stay identical.
 */
const RUST_DEFAULTS = readFileSync(
	resolve(process.cwd(), 'src-tauri/src/providers/mod.rs'),
	'utf8'
);

/** `kimi` → `KIMI`, `minimax-coding` → `MINIMAX_CODING` */
function rustConstantPrefix(key: string): string {
	return key.toUpperCase().replace(/-/g, '_');
}

function rustDefault(key: string, kind: 'API_URL' | 'MODEL'): string | null {
	const pattern = new RegExp(
		`const ${rustConstantPrefix(key)}_DEFAULT_${kind}: &str = "([^"]*)";`
	);

	return RUST_DEFAULTS.match(pattern)?.[1] ?? null;
}

describe('AI provider defaults', () => {
	const definitions = getProviderDefinitions().filter(
		(definition) => definition.key !== 'custom'
	);

	it('covers every built-in provider', () => {
		expect(definitions.length).toBeGreaterThan(5);
	});

	for (const definition of definitions) {
		it(`${definition.key} matches the backend defaults`, () => {
			expect(rustDefault(definition.key, 'API_URL')).toBe(
				definition.defaultApiUrl
			);
			expect(rustDefault(definition.key, 'MODEL')).toBe(
				definition.defaultModel
			);
		});
	}
});
