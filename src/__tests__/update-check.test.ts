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
				mockJsonResponse([
					{
						html_url: 'https://github.com/1Yie/madora/releases/tag/v0.4.0',
						tag_name: 'v0.4.0',
					},
				])
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
				mockJsonResponse([
					{
						tag_name: 'v0.3.9',
					},
				])
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
				mockJsonResponse([
					{
						tag_name: 'v0.4.0',
					},
				])
			)
		);

		await expect(checkForAppUpdate('0.4.0-beta.1')).resolves.toMatchObject({
			currentVersion: '0.4.0-beta.1',
			latestVersion: '0.4.0',
			updateAvailable: true,
		});
	});

	it('falls back to the release name when the tag is not a version', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn(async () =>
				mockJsonResponse([
					{
						html_url:
							'https://github.com/1Yie/madora/releases/tag/untagged-c00cce0a168073402b1d',
						name: 'Madora Desktop 0.3.16 | Mobile 0.0.4',
						tag_name: 'untagged-c00cce0a168073402b1d',
					},
					{
						tag_name: 'v0.3.14',
					},
				])
			)
		);

		await expect(checkForAppUpdate('0.3.14')).resolves.toMatchObject({
			latestVersion: '0.3.16',
			releaseUrl:
				'https://github.com/1Yie/madora/releases/tag/untagged-c00cce0a168073402b1d',
			updateAvailable: true,
		});
	});

	it('ignores drafts, prereleases, and releases without a version', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn(async () =>
				mockJsonResponse([
					{
						draft: true,
						tag_name: 'v9.9.9',
					},
					{
						prerelease: true,
						tag_name: 'v0.5.0',
					},
					{
						tag_name: 'latest',
					},
					{
						tag_name: 'v0.3.9',
					},
				])
			)
		);

		await expect(checkForAppUpdate('0.3.9')).resolves.toMatchObject({
			latestVersion: '0.3.9',
			updateAvailable: false,
		});
	});

	it('rejects when no release has a resolvable version', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn(async () =>
				mockJsonResponse([
					{
						tag_name: 'latest',
					},
				])
			)
		);

		await expect(checkForAppUpdate('0.3.9')).rejects.toThrow(
			'No valid release found.'
		);
	});
});
