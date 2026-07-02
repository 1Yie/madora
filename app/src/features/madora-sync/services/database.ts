import type { SQLiteDatabase } from 'expo-sqlite';

export const MADORA_SYNC_DB_NAME = 'madora-sync.db';

const LOCAL_DEVICE_ID = 'device-mobile-local';

const INITIAL_DEVICES = [
	{
		address: 'local',
		id: LOCAL_DEVICE_ID,
		kind: 'mobile',
		lastSeen: Date.now(),
		name: 'Madora Phone',
		token: 'mobile-local-token',
		trusted: 1,
	},
];

export async function initializeDatabase(db: SQLiteDatabase) {
	const targetVersion = 3;
	const versionRow = await db.getFirstAsync<{ user_version: number }>(
		'PRAGMA user_version'
	);
	let currentVersion = versionRow?.user_version ?? 0;

	if (currentVersion === 0) {
		await db.execAsync(`
      PRAGMA journal_mode = WAL;

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

		currentVersion = 1;
	}

	await db.execAsync(`
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

	await db.execAsync(`PRAGMA user_version = ${targetVersion}`);
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
