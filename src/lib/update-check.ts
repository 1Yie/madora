const GITHUB_REPO = '1Yie/madora';
const GITHUB_API_ACCEPT = 'application/vnd.github+json';

export const GITHUB_RELEASES_URL = `https://github.com/${GITHUB_REPO}/releases`;
const GITHUB_LATEST_RELEASE_API_URL = `https://api.github.com/repos/${GITHUB_REPO}/releases/latest`;

type GitHubLatestReleaseResponse = {
	html_url?: string;
	tag_name?: string;
};

export type AppUpdateInfo = {
	currentVersion: string;
	latestVersion: string;
	releaseUrl: string;
	updateAvailable: boolean;
};

type ParsedVersion = {
	core: number[];
	prerelease: string[];
};

function normalizeVersion(version: string): string {
	return version.trim().replace(/^v/i, '');
}

function parseVersion(version: string): ParsedVersion | null {
	const normalizedVersion = normalizeVersion(version);
	const match = normalizedVersion.match(
		/^(\d+(?:\.\d+)*)(?:-([0-9A-Za-z.-]+))?$/
	);

	if (!match) {
		return null;
	}

	return {
		core: match[1].split('.').map((segment) => Number.parseInt(segment, 10)),
		prerelease: match[2]?.split('.') ?? [],
	};
}

function compareIdentifier(left: string, right: string): number {
	const leftNumeric = /^\d+$/.test(left);
	const rightNumeric = /^\d+$/.test(right);

	if (leftNumeric && rightNumeric) {
		return Number.parseInt(left, 10) - Number.parseInt(right, 10);
	}

	if (leftNumeric) {
		return -1;
	}

	if (rightNumeric) {
		return 1;
	}

	return left.localeCompare(right);
}

function compareVersions(left: string, right: string): number {
	const leftVersion = parseVersion(left);
	const rightVersion = parseVersion(right);

	if (!leftVersion || !rightVersion) {
		throw new Error('Invalid version format.');
	}

	const maxCoreLength = Math.max(
		leftVersion.core.length,
		rightVersion.core.length
	);

	for (let index = 0; index < maxCoreLength; index += 1) {
		const leftSegment = leftVersion.core[index] ?? 0;
		const rightSegment = rightVersion.core[index] ?? 0;

		if (leftSegment !== rightSegment) {
			return leftSegment - rightSegment;
		}
	}

	const leftHasPrerelease = leftVersion.prerelease.length > 0;
	const rightHasPrerelease = rightVersion.prerelease.length > 0;

	if (!leftHasPrerelease && !rightHasPrerelease) {
		return 0;
	}

	if (!leftHasPrerelease) {
		return 1;
	}

	if (!rightHasPrerelease) {
		return -1;
	}

	const maxPrereleaseLength = Math.max(
		leftVersion.prerelease.length,
		rightVersion.prerelease.length
	);

	for (let index = 0; index < maxPrereleaseLength; index += 1) {
		const leftIdentifier = leftVersion.prerelease[index];
		const rightIdentifier = rightVersion.prerelease[index];

		if (leftIdentifier === undefined) {
			return -1;
		}

		if (rightIdentifier === undefined) {
			return 1;
		}

		const result = compareIdentifier(leftIdentifier, rightIdentifier);
		if (result !== 0) {
			return result;
		}
	}

	return 0;
}

export async function checkForAppUpdate(
	currentVersion: string
): Promise<AppUpdateInfo> {
	const response = await fetch(GITHUB_LATEST_RELEASE_API_URL, {
		headers: {
			Accept: GITHUB_API_ACCEPT,
		},
	});

	if (!response.ok) {
		throw new Error(`GitHub API responded with ${response.status}`);
	}

	const release = (await response.json()) as GitHubLatestReleaseResponse;
	const latestVersion = release.tag_name
		? normalizeVersion(release.tag_name)
		: '';
	const normalizedCurrentVersion = normalizeVersion(currentVersion);

	if (!parseVersion(normalizedCurrentVersion)) {
		throw new Error('Current app version is invalid.');
	}

	if (!parseVersion(latestVersion)) {
		throw new Error('Latest release version is invalid.');
	}

	return {
		currentVersion: normalizedCurrentVersion,
		latestVersion,
		releaseUrl: release.html_url ?? GITHUB_RELEASES_URL,
		updateAvailable:
			compareVersions(latestVersion, normalizedCurrentVersion) > 0,
	};
}
