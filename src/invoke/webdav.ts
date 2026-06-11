import { invoke } from '@tauri-apps/api/core';

// ── Types (mirrored from Rust models) ───────────────────────────

export type ConflictStrategy = 'local_first' | 'remote_first' | 'keep_both';

export interface WebDavConfig {
	url: string | null;
	username: string | null;
	conflict_strategy: ConflictStrategy;
	remote_subdir: string | null;
	local_subdir: string | null;
	last_sync_at: string | null;
	/** Password is loaded from keychain on read, never persisted to JSON. */
	password: string | null;
}

export interface WebDavConnectionTest {
	success: boolean;
	server_name: string | null;
	error: string | null;
}

export interface WebDavSyncResult {
	files_uploaded: number;
	files_downloaded: number;
	conflicts_resolved: number;
	errors: string[];
}

export type WebDavFileSyncStatus =
	| 'synced'
	| 'modified'
	| 'new'
	| 'deleted'
	| 'unsynced';

export interface WebDavSyncFileEntry {
	relative_path: string;
	status: WebDavFileSyncStatus;
}

export interface WebDavSyncStatusResult {
	files: WebDavSyncFileEntry[];
}

// ── Commands ────────────────────────────────────────────────────

/** Load the full WebDAV config (including password from keychain). */
export async function webdavGetConfig(): Promise<WebDavConfig> {
	return invoke<WebDavConfig>('webdav_get_config');
}

/** Save WebDAV config and optional password. */
export async function webdavSaveConfig(
	config: WebDavConfig,
	password?: string
): Promise<void> {
	return invoke('webdav_save_config', { config, password: password ?? null });
}

/** Delete WebDAV config and password from keychain. */
export async function webdavDeleteConfig(): Promise<void> {
	return invoke('webdav_delete_config');
}

/** Test connection with optional override credentials. */
export async function webdavTestConnection(opts?: {
	url?: string;
	username?: string;
	password?: string;
}): Promise<WebDavConnectionTest> {
	return invoke<WebDavConnectionTest>('webdav_test_connection', {
		url: opts?.url ?? null,
		username: opts?.username ?? null,
		password: opts?.password ?? null,
	});
}

/** Perform a full sync. Returns sync result summary. */
export async function webdavSync(
	workspaceRoot: string
): Promise<WebDavSyncResult> {
	return invoke<WebDavSyncResult>('webdav_sync', {
		workspaceRoot,
	});
}

/** Get WebDAV sync status for all tracked files. */
export async function webdavGetStatus(
	workspaceRoot: string
): Promise<WebDavSyncStatusResult> {
	return invoke<WebDavSyncStatusResult>('webdav_get_status', {
		workspaceRoot,
	});
}
