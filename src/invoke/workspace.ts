import { invoke } from '@tauri-apps/api/core';

export type WorkspaceState = {
	rootPath: string | null;
	openTabPaths: string[];
	lastActiveFilePath: string | null;
	sidebarWidth: number | null;
	sortEnabled: boolean | null;
	showHiddenFiles: boolean | null;
	tabBarMode: string | null;
	zoomLevel: number | null;
};

/** Get the persisted workspace state (called on app start). */
export async function getWorkspaceState(): Promise<WorkspaceState> {
	return invoke<WorkspaceState>('get_workspace_state');
}

/** Set workspace root path (clears tabs when different from current). */
export async function setWorkspaceRoot(rootPath: string | null): Promise<void> {
	return invoke('set_workspace_root', { rootPath });
}

/** Add a file to the open tabs list. */
export async function addTab(filePath: string): Promise<void> {
	return invoke('add_tab', { filePath });
}

/** Remove a file from the open tabs list. */
export async function closeTab(filePath: string): Promise<void> {
	return invoke('close_tab', { filePath });
}

/** Remove multiple files from the open tabs list. */
export async function closeTabs(filePaths: string[]): Promise<void> {
	return invoke('close_tabs', { filePaths });
}

/** Set the active (focused) tab. */
export async function setActiveTab(filePath: string | null): Promise<void> {
	return invoke('set_active_tab', { filePath });
}

/** Persist sidebar width. */
export async function setSidebarWidth(width: number): Promise<void> {
	return invoke('set_sidebar_width', { width });
}

/** Persist tab bar mode ("scroll" | "wrap"). */
export async function setTabBarMode(mode: string): Promise<void> {
	return invoke('set_tab_bar_mode', { mode });
}

/** Persist webview zoom level (1.0 = 100%). */
export async function setZoomLevel(zoomLevel: number): Promise<void> {
	return invoke('set_zoom_level', { zoomLevel });
}

/** Replace the open tab paths wholesale. */
export async function setOpenTabPaths(paths: string[]): Promise<void> {
	return invoke('set_open_tab_paths', { paths });
}

/** Clear all persisted workspace state. */
export async function clearWorkspaceState(): Promise<void> {
	return invoke('clear_workspace_state');
}

/**
 * Resolve a markdown image source to an absolute filesystem path.
 * The caller should then pass the result through `convertFileSrc()`
 * to obtain a Tauri asset protocol URL.
 */
export async function resolveImageSrc(
	src: string,
	filePath: string,
	rootPath: string | null
): Promise<string> {
	return invoke<string>('resolve_image_src', { src, filePath, rootPath });
}
