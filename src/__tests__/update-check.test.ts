import { afterEach, describe, expect, it, vi } from 'vitest';
import { checkForAppUpdate, GITHUB_RELEASES_URL } from '@/lib/update-check';

type MockFetchResponse = {
	ok: boolean;
	status: number;
	json: () => Promise<unknown>;
};

function mockJsonResponse(body: unknown): MockFetchResponse {
	return {
		json: async () => body,
		ok: true,
		status: 200,
	};
}

afterEach(() => {
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
});

describe('checkForAppUpdate', () => {
	it('reports an update when GitHub has a newer stable release', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn(async () =>
				mockJsonResponse({
					html_url: 'https://github.com/1Yie/madora/releases/tag/v0.4.0',
					tag_name: 'v0.4.0',
				})
			)
		);

		await expect(checkForAppUpdate('0.3.9')).resolves.toMatchObject({
			currentVersion: '0.3.9',
			latestVersion: '0.4.0',
			releaseUrl: 'https://github.com/1Yie/madora/releases/tag/v0.4.0',
			updateAvailable: true,
		});
	});

	it('treats the same release tag as up to date', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn(async () =>
				mockJsonResponse({
					tag_name: 'v0.3.9',
				})
			)
		);

		await expect(checkForAppUpdate('0.3.9')).resolves.toMatchObject({
			latestVersion: '0.3.9',
			releaseUrl: GITHUB_RELEASES_URL,
			updateAvailable: false,
		});
	});

	it('treats stable releases as newer than prerelease builds', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn(async () =>
				mockJsonResponse({
					tag_name: 'v0.4.0',
				})
			)
		);

		await expect(checkForAppUpdate('0.4.0-beta.1')).resolves.toMatchObject({
			currentVersion: '0.4.0-beta.1',
			latestVersion: '0.4.0',
			updateAvailable: true,
		});
	});

	it('rejects invalid release tags', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn(async () =>
				mockJsonResponse({
					tag_name: 'latest',
				})
			)
		);

		await expect(checkForAppUpdate('0.3.9')).rejects.toThrow(
			'Latest release version is invalid.'
		);
	});
});
