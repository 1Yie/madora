import type { SQLiteDatabase } from 'expo-sqlite';

import { formatSyncDisplayAddress } from '../lib/protocol';
import type { TrustedDevice } from '../types';
import deleteTrustedDeviceSql from './sql/delete-trusted-device.sql';
import enableWalSql from './sql/enable-wal.sql';
import initializeSyncSchemaSql from './sql/initialize-sync-schema.sql';
import insertSettingIfMissingSql from './sql/insert-setting-if-missing.sql';
import listTrustedDevicesSql from './sql/list-trusted-devices.sql';
import readUserVersionSql from './sql/read-user-version.sql';
import readSettingsSql from './sql/read-settings.sql';
import setSchemaVersionSql from './sql/set-schema-version.sql';
import upsertTrustedDeviceSql from './sql/upsert-trusted-device.sql';
import writeSettingSql from './sql/write-setting.sql';

export const MADORA_SYNC_DB_NAME = 'madora-sync.db';

export const LOCAL_DEVICE_ID = 'device-mobile-local';
function getInitialSettings(defaultLocalDeviceName: string) {
	return {
		last_sync_at: '',
		local_device_name: defaultLocalDeviceName,
		offline_mode: '0',
		paired_host_id: '',
		paired_host_json: '',
		sync_enabled: '1',
		use_desktop_ai_completion: '0',
	} satisfies Record<string, string>;
}

export async function initializeDatabase(
	db: SQLiteDatabase,
	defaultLocalDeviceName: string
) {
	const versionRow = await db.getFirstAsync<{ user_version: number }>(
		readUserVersionSql
	);
	const currentVersion = versionRow?.user_version ?? 0;

	if (currentVersion === 0) {
		await db.execAsync(enableWalSql);
	}

	await db.execAsync(initializeSyncSchemaSql);
	await deleteTrustedDevice(db, LOCAL_DEVICE_ID);

	for (const [key, value] of Object.entries(
		getInitialSettings(defaultLocalDeviceName)
	)) {
		await insertSettingIfMissing(db, key, value);
	}

	await db.execAsync(setSchemaVersionSql);
}

export async function readSettings(db: SQLiteDatabase) {
	const rows = await db.getAllAsync<{ key: string; value: string }>(
		readSettingsSql
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
	await db.runAsync(writeSettingSql, key, value);
}

async function insertSettingIfMissing(
	db: SQLiteDatabase,
	key: string,
	value: string
) {
	await db.runAsync(insertSettingIfMissingSql, key, value);
}

export async function listTrustedDevices(db: SQLiteDatabase) {
	const rows = await db.getAllAsync<TrustedDeviceRow>(
		listTrustedDevicesSql,
		LOCAL_DEVICE_ID
	);

	return rows.map(deviceRowToTrustedDevice);
}

export async function upsertTrustedDevice(
	db: SQLiteDatabase,
	device: TrustedDevice
) {
	await db.runAsync(
		upsertTrustedDeviceSql,
		device.id,
		device.name,
		device.kind,
		device.lastSeen,
		device.trusted ? 1 : 0,
		device.token,
		formatSyncDisplayAddress(device.address)
	);
}

export async function deleteTrustedDevice(db: SQLiteDatabase, id: string) {
	await db.runAsync(deleteTrustedDeviceSql, id);
}

type TrustedDeviceRow = {
	address: string;
	id: string;
	kind: 'desktop' | 'mobile';
	lastSeen: number;
	name: string;
	token: string;
	trusted: number;
};

function deviceRowToTrustedDevice(device: TrustedDeviceRow): TrustedDevice {
	return {
		address: formatSyncDisplayAddress(device.address),
		id: device.id,
		kind: device.kind,
		lastSeen: device.lastSeen,
		name: device.name,
		token: device.token,
		trusted: Boolean(device.trusted),
	};
}
