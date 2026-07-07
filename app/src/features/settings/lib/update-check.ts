const GITHUB_REPO = '1Yie/madora';
const GITHUB_API_ACCEPT = 'application/vnd.github+json';

const GITHUB_RELEASES_URL = `https://github.com/${GITHUB_REPO}/releases`;
const GITHUB_LATEST_RELEASE_API_URL = `https://api.github.com/repos/${GITHUB_REPO}/releases/latest`;

type GitHubLatestReleaseResponse = {
	html_url?: string;
};

export type LatestReleaseInfo = {
	releaseUrl: string;
};

export async function checkLatestRelease(): Promise<LatestReleaseInfo> {
	const response = await fetch(GITHUB_LATEST_RELEASE_API_URL, {
		headers: {
			Accept: GITHUB_API_ACCEPT,
		},
	});

	if (!response.ok) {
		throw new Error(`GitHub API responded with ${response.status}`);
	}

	const release = (await response.json()) as GitHubLatestReleaseResponse;

	return {
		releaseUrl: release.html_url ?? GITHUB_RELEASES_URL,
	};
}
