import { invoke } from '@tauri-apps/api/core';

export type CliStatus = {
	available: boolean;
	installed: boolean;
	in_path: boolean;
	managed_dir_in_path: boolean;
	needs_terminal_restart: boolean;
	source_path: string | null;
	install_path: string;
	command_name: string;
	path_hint: string | null;
};

export type CliInstallResult = {
	success: boolean;
	source: string;
	dest: string;
	path_updated: boolean;
	needs_terminal_restart: boolean;
	path_hint: string | null;
};

export type CliUninstallResult = {
	success: boolean;
	removed: string;
	path_updated: boolean;
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

/** Installs the managed mado binary for the current platform. */
export async function installCli(): Promise<CliInstallResult> {
	return invoke('install_cli');
}

/** Removes the managed mado binary from the local machine. */
export async function uninstallCli(): Promise<CliUninstallResult> {
	return invoke('uninstall_cli');
}

/** Shows the main application window (called once on startup). */
export async function showWindow(): Promise<void> {
	return invoke('show_window');
}
