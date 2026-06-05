import {
	getIdentifier,
	getName,
	getTauriVersion,
	getVersion,
} from '@tauri-apps/api/app';

export type AppInfo = {
	identifier: string;
	name: string;
	tauriVersion: string;
	version: string;
};

/** Returns application metadata (name, version, identifier, tauri version). */
export async function getAppInfo(): Promise<AppInfo> {
	const [name, version, tauriVersion, identifier] = await Promise.all([
		getName(),
		getVersion(),
		getTauriVersion(),
		getIdentifier(),
	]);
	return { identifier, name, tauriVersion, version };
}
