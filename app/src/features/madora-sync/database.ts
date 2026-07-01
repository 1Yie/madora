import type { SQLiteDatabase } from 'expo-sqlite';
import type { SyncDocument } from './types';

export const MADORA_SYNC_DB_NAME = 'madora-sync.db';
export const DEFAULT_LOCAL_DOCUMENT_ID = 'local-welcome';

const LOCAL_DEVICE_ID = 'device-mobile-local';
const DEFAULT_LOCAL_DOCUMENT: SyncDocument = {
	id: DEFAULT_LOCAL_DOCUMENT_ID,
	title: 'Welcome.md',
	path: 'local://Welcome.md',
	content:
		'# Welcome to Madora Mobile\n\nStart writing Markdown here. AI completion and preview work locally after you configure a provider in AI settings.\n',
	updatedAt: Date.now(),
};

const INITIAL_DEVICES = [
	{
		id: LOCAL_DEVICE_ID,
		name: 'Madora Phone',
		kind: 'mobile',
		lastSeen: Date.now(),
		trusted: 1,
		token: 'mobile-local-token',
		address: 'local',
	},
];

export async function initializeDatabase(db: SQLiteDatabase) {
	const targetVersion = 2;
	const versionRow = await db.getFirstAsync<{ user_version: number }>(
		'PRAGMA user_version'
	);
	let currentVersion = versionRow?.user_version ?? 0;

	if (currentVersion === 0) {
		await db.execAsync(`
      PRAGMA journal_mode = WAL;

      CREATE TABLE IF NOT EXISTS documents (
        id TEXT PRIMARY KEY NOT NULL,
        title TEXT NOT NULL,
        path TEXT NOT NULL,
        content TEXT NOT NULL,
        updated_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS updates (
        id TEXT PRIMARY KEY NOT NULL,
        doc_id TEXT NOT NULL,
        kind TEXT NOT NULL,
        payload TEXT NOT NULL,
        sync_state TEXT NOT NULL,
        created_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS snapshots (
        id TEXT PRIMARY KEY NOT NULL,
        doc_id TEXT NOT NULL,
        state TEXT NOT NULL,
        created_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY NOT NULL,
        value TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS devices (
        id TEXT PRIMARY KEY NOT NULL,
        name TEXT NOT NULL,
        kind TEXT NOT NULL,
        last_seen INTEGER NOT NULL,
        trusted INTEGER NOT NULL,
        token TEXT NOT NULL,
        address TEXT NOT NULL
      );
    `);

		for (const device of INITIAL_DEVICES) {
			await db.runAsync(
				'INSERT OR IGNORE INTO devices (id, name, kind, last_seen, trusted, token, address) VALUES (?, ?, ?, ?, ?, ?, ?)',
				device.id,
				device.name,
				device.kind,
				device.lastSeen,
				device.trusted,
				device.token,
				device.address
			);
		}

		await db.runAsync(
			'INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)',
			'offline_mode',
			'0'
		);
		await db.runAsync(
			'INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)',
			'paired_host_id',
			''
		);
		await db.runAsync(
			'INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)',
			'paired_host_json',
			''
		);
		await db.runAsync(
			'INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)',
			'last_sync_at',
			''
		);
		await db.runAsync(
			'INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)',
			'selected_document_id',
			DEFAULT_LOCAL_DOCUMENT_ID
		);

		currentVersion = 1;
	}

	if (currentVersion < 2) {
		await db.runAsync(
			'INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)',
			'selected_document_id',
			DEFAULT_LOCAL_DOCUMENT_ID
		);
		currentVersion = 2;
	}

	await ensureDefaultLocalDocument(db);

	if (currentVersion < targetVersion) {
		await db.execAsync(`PRAGMA user_version = ${targetVersion}`);
	} else {
		await db.execAsync(`PRAGMA user_version = ${currentVersion}`);
	}
}

export async function readSettings(db: SQLiteDatabase) {
	const rows = await db.getAllAsync<{ key: string; value: string }>(
		'SELECT key, value FROM settings'
	);

	return rows.reduce<Record<string, string>>((settings, row) => {
		settings[row.key] = row.value;
		return settings;
	}, {});
}

export async function writeSetting(
	db: SQLiteDatabase,
	key: string,
	value: string
) {
	await db.runAsync(
		'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
		key,
		value
	);
}

export async function readDocuments(
	db: SQLiteDatabase
): Promise<SyncDocument[]> {
	const rows = await db.getAllAsync<{
		content: string;
		id: string;
		path: string;
		title: string;
		updated_at: number;
	}>(
		'SELECT id, title, path, content, updated_at FROM documents ORDER BY updated_at DESC'
	);

	return rows.map((row) => ({
		content: row.content,
		id: row.id,
		path: row.path,
		title: row.title,
		updatedAt: row.updated_at,
	}));
}

export async function upsertDocument(
	db: SQLiteDatabase,
	document: SyncDocument
) {
	await db.runAsync(
		'INSERT INTO documents (id, title, path, content, updated_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET title = excluded.title, path = excluded.path, content = excluded.content, updated_at = excluded.updated_at',
		document.id,
		document.title,
		document.path,
		document.content,
		document.updatedAt
	);
}

async function ensureDefaultLocalDocument(db: SQLiteDatabase) {
	const existing = await db.getFirstAsync<{ id: string }>(
		'SELECT id FROM documents WHERE id = ?',
		DEFAULT_LOCAL_DOCUMENT_ID
	);

	if (existing) return;
	await upsertDocument(db, DEFAULT_LOCAL_DOCUMENT);
}
