import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import modelsByProvider from '@/assets/models.json';
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
const MOBILE_DEFAULTS = readFileSync(
	resolve(process.cwd(), 'app/src/features/ai/lib/provider-definitions.ts'),
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

function mobileDefaults(key: string): {
	defaultApiUrl: string;
	defaultModel: string;
} | null {
	const pattern = new RegExp(
		`defaultApiUrl:\\s*'([^']*)',\\s*defaultModel:\\s*'([^']*)',\\s*key:\\s*'${key}'`
	);
	const match = MOBILE_DEFAULTS.match(pattern);

	return match ? { defaultApiUrl: match[1], defaultModel: match[2] } : null;
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

		it(`${definition.key} matches the mobile defaults`, () => {
			expect(mobileDefaults(definition.key)).toEqual({
				defaultApiUrl: definition.defaultApiUrl,
				defaultModel: definition.defaultModel,
			});
		});
	}
});

// Desktop and mobile bundle separate snapshots. When refreshing from
// models.dev, verify each provider's actual model IDs and protocol as well.
describe('AI model catalogue', () => {
	const definitions = getProviderDefinitions().filter(
		(definition) => definition.key !== 'custom'
	);
	const catalogue: Record<string, { name: string; value: string }[]> =
		modelsByProvider;

	it('contains exactly the built-in providers', () => {
		expect(Object.keys(catalogue).sort()).toEqual(
			definitions.map((definition) => definition.key).sort()
		);
	});

	it('matches the mobile catalogue', () => {
		const mobileCatalogue = JSON.parse(
			readFileSync(resolve(process.cwd(), 'app/assets/models.json'), 'utf8')
		);

		expect(mobileCatalogue).toEqual(catalogue);
	});

	for (const definition of definitions) {
		it(`${definition.key} has distinct, nonempty models including its default`, () => {
			const models = catalogue[definition.key];

			expect(models.length).toBeGreaterThan(0);
			expect(new Set(models.map((model) => model.value)).size).toBe(
				models.length
			);
			expect(
				models.some((model) => model.value === definition.defaultModel)
			).toBe(true);
			for (const model of models) {
				expect(model.name.trim()).toBe(model.name);
				expect(model.name).not.toBe('');
				expect(model.value.trim()).toBe(model.value);
				expect(model.value).not.toBe('');
			}
		});
	}
});
