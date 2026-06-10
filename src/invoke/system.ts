import { invoke } from '@tauri-apps/api/core';

export type CliStatus = {
	available: boolean;
	in_path: boolean;
	symlink_exists: boolean;
	symlink_ok: boolean;
	binary_path: string | null;
	symlink_path: string;
};

/** Checks whether a file or directory exists on the filesystem. */
export async function pathExists(
	rootPath: string,
	path: string
): Promise<boolean> {
	return invoke<boolean>('path_exists', { rootPath, path });
}

/** Checks whether an absolute path exists on the filesystem (no workspace root required). */
export async function absolutePathExists(path: string): Promise<boolean> {
	return invoke<boolean>('absolute_path_exists', { path });
}

/** Returns the current OS theme mode and system accent color. */
export async function getSystemTheme(): Promise<{
	scheme: string;
	accent?: string | null;
}> {
	return invoke<{ scheme: string; accent?: string | null }>('get_system_theme');
}

/** Gets the CLI installation status (binary, symlink, PATH). */
export async function getCliStatus(): Promise<CliStatus> {
	return invoke<CliStatus>('get_cli_status');
}

/** Creates a mado symlink in ~/.local/bin/. */
export async function installCli(): Promise<{ success: boolean }> {
	return invoke('install_cli');
}

/** Removes the mado symlink from ~/.local/bin/. */
export async function uninstallCli(): Promise<{ success: boolean }> {
	return invoke('uninstall_cli');
}

/** Shows the main application window (called once on startup). */
export async function showWindow(): Promise<void> {
	return invoke('show_window');
}
