import { invoke } from '@tauri-apps/api/core';

export type MadoraSyncRole = 'host' | 'client';

export type MadoraSyncConnectionState =
	| 'disconnected'
	| 'discovering'
	| 'connecting'
	| 'authenticating'
	| 'syncing'
	| 'connected';

export interface MadoraSyncPairedDevice {
	id: string;
	name: string;
	platform: string | null;
	lastSeenAt: string | null;
	trusted: boolean;
}

export interface MadoraSyncConfig {
	enabled: boolean;
	role: MadoraSyncRole;
	deviceName: string;
	port: number;
	autoStartServer: boolean;
	allowLanDiscovery: boolean;
	shareAiCompletions: boolean;
	connectionState: MadoraSyncConnectionState;
	lastSyncAt: string | null;
	lastError: string | null;
	activePairingId: string | null;
	activePairingToken: string | null;
	activePairingCode: string | null;
	pairingCodeExpiresAt: string | null;
	pairedDevices: MadoraSyncPairedDevice[];
}

export interface MadoraSyncSettingsInput {
	enabled: boolean;
	deviceName: string;
	port: number;
	autoStartServer: boolean;
	allowLanDiscovery: boolean;
	shareAiCompletions: boolean;
}

export interface MadoraSyncPairingCode {
	code: string;
	expiresAt: string;
}

export interface MadoraSyncPairingQr {
	pairingId: string;
	payload: string | null;
	availableHosts: string[];
	primaryHost: string | null;
	port: number;
	code: string;
	expiresAt: string;
	deviceName: string;
}

export interface MadoraSyncPairDeviceInput {
	deviceId: string;
	deviceName: string;
	platform?: string | null;
	pairingId?: string | null;
	pairingToken?: string | null;
	pairingCode?: string | null;
}

export interface MadoraSyncPairDeviceResult {
	device: MadoraSyncPairedDevice;
	pairedAt: string;
}

export async function madoraSyncGetConfig(): Promise<MadoraSyncConfig> {
	return invoke<MadoraSyncConfig>('madora_sync_get_config');
}

export async function madoraSyncSaveSettings(
	settings: MadoraSyncSettingsInput
): Promise<MadoraSyncConfig> {
	return invoke<MadoraSyncConfig>('madora_sync_save_settings', { settings });
}

export async function madoraSyncIssuePairingCode(): Promise<MadoraSyncPairingCode> {
	return invoke<MadoraSyncPairingCode>('madora_sync_issue_pairing_code');
}

export async function madoraSyncGetPairingQr(): Promise<MadoraSyncPairingQr> {
	return invoke<MadoraSyncPairingQr>('madora_sync_get_pairing_qr');
}

export async function madoraSyncClearPairingCode(): Promise<MadoraSyncConfig> {
	return invoke<MadoraSyncConfig>('madora_sync_clear_pairing_code');
}

export async function madoraSyncRemovePairedDevice(
	deviceId: string
): Promise<MadoraSyncConfig> {
	return invoke<MadoraSyncConfig>('madora_sync_remove_paired_device', {
		deviceId,
	});
}

export async function madoraSyncPairDevice(
	request: MadoraSyncPairDeviceInput
): Promise<MadoraSyncPairDeviceResult> {
	return invoke<MadoraSyncPairDeviceResult>('madora_sync_pair_device', {
		request,
	});
}

export async function madoraSyncRestartServer(): Promise<boolean> {
	return invoke<boolean>('madora_sync_restart_server');
}
