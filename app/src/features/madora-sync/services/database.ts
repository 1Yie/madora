import type { SQLiteDatabase } from 'expo-sqlite';
import { desc, eq, ne } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/expo-sqlite';
import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

import type { TrustedDevice } from '../types';

export const MADORA_SYNC_DB_NAME = 'madora-sync.db';

export const LOCAL_DEVICE_ID = 'device-mobile-local';
const TARGET_SCHEMA_VERSION = 3;
const CREATE_SYNC_SCHEMA_SQL = `
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
`;
function getInitialSettings(defaultLocalDeviceName: string) {
	return {
		last_sync_at: '',
		local_device_name: defaultLocalDeviceName,
		offline_mode: '0',
		paired_host_id: '',
		paired_host_json: '',
	} satisfies Record<string, string>;
}

export const syncSettingsTable = sqliteTable('settings', {
	key: text('key').primaryKey().notNull(),
	value: text('value').notNull(),
});

export const syncDevicesTable = sqliteTable('devices', {
	address: text('address').notNull(),
	id: text('id').primaryKey().notNull(),
	kind: text('kind', { enum: ['desktop', 'mobile'] }).notNull(),
	lastSeen: integer('last_seen').notNull(),
	name: text('name').notNull(),
	token: text('token').notNull(),
	trusted: integer('trusted', { mode: 'boolean' }).notNull(),
});

function getSyncDatabase(db: SQLiteDatabase) {
	return drizzle(db);
}

export async function initializeDatabase(
	db: SQLiteDatabase,
	defaultLocalDeviceName: string
) {
	const versionRow = await db.getFirstAsync<{ user_version: number }>(
		'PRAGMA user_version'
	);
	const currentVersion = versionRow?.user_version ?? 0;

	if (currentVersion === 0) {
		await db.execAsync('PRAGMA journal_mode = WAL');
	}

	await db.execAsync(CREATE_SYNC_SCHEMA_SQL);
	await deleteTrustedDevice(db, LOCAL_DEVICE_ID);

	for (const [key, value] of Object.entries(
		getInitialSettings(defaultLocalDeviceName)
	)) {
		await insertSettingIfMissing(db, key, value);
	}

	await db.execAsync(`PRAGMA user_version = ${TARGET_SCHEMA_VERSION}`);
}

export async function readSettings(db: SQLiteDatabase) {
	const orm = getSyncDatabase(db);
	const rows = await orm.select().from(syncSettingsTable);

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
	const orm = getSyncDatabase(db);
	const existing = await orm
		.select({ key: syncSettingsTable.key })
		.from(syncSettingsTable)
		.where(eq(syncSettingsTable.key, key))
		.limit(1);

	if (existing.length > 0) {
		await orm
			.update(syncSettingsTable)
			.set({ value })
			.where(eq(syncSettingsTable.key, key));
		return;
	}

	await orm.insert(syncSettingsTable).values({ key, value });
}

async function insertSettingIfMissing(
	db: SQLiteDatabase,
	key: string,
	value: string
) {
	const orm = getSyncDatabase(db);
	const existing = await orm
		.select({ key: syncSettingsTable.key })
		.from(syncSettingsTable)
		.where(eq(syncSettingsTable.key, key))
		.limit(1);

	if (existing.length === 0) {
		await orm.insert(syncSettingsTable).values({ key, value });
	}
}

export async function listTrustedDevices(db: SQLiteDatabase) {
	const orm = getSyncDatabase(db);
	const rows = await orm
		.select()
		.from(syncDevicesTable)
		.where(ne(syncDevicesTable.id, LOCAL_DEVICE_ID))
		.orderBy(desc(syncDevicesTable.lastSeen));

	return rows.map(deviceRowToTrustedDevice);
}

export async function upsertTrustedDevice(
	db: SQLiteDatabase,
	device: TrustedDevice
) {
	const orm = getSyncDatabase(db);
	const existing = await orm
		.select({ id: syncDevicesTable.id })
		.from(syncDevicesTable)
		.where(eq(syncDevicesTable.id, device.id))
		.limit(1);

	if (existing.length > 0) {
		await orm
			.update(syncDevicesTable)
			.set({
				address: device.address,
				lastSeen: device.lastSeen,
				name: device.name,
				token: device.token,
				trusted: device.trusted,
			})
			.where(eq(syncDevicesTable.id, device.id));
		return;
	}

	await orm.insert(syncDevicesTable).values(device);
}

export async function deleteTrustedDevice(db: SQLiteDatabase, id: string) {
	const orm = getSyncDatabase(db);
	await orm.delete(syncDevicesTable).where(eq(syncDevicesTable.id, id));
}

function deviceRowToTrustedDevice(
	device: typeof syncDevicesTable.$inferSelect
): TrustedDevice {
	return {
		address: device.address,
		id: device.id,
		kind: device.kind,
		lastSeen: device.lastSeen,
		name: device.name,
		token: device.token,
		trusted: device.trusted,
	};
}
