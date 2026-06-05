import { openUrl as tauriOpenUrl } from '@tauri-apps/plugin-opener';

/** Opens a URL with the system's default browser. */
export async function openUrl(url: string | URL): Promise<void> {
	return tauriOpenUrl(url);
}
