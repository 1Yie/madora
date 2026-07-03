#!/usr/bin/env bun

import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';

const REPO_ROOT = path.resolve(import.meta.dirname, '..');
const TAURI_CONFIG_PATH = path.join(REPO_ROOT, 'src-tauri', 'tauri.conf.json');
const STATE_FILE_NAME = 'madora_sync_state.json';

function printHelp() {
	console.log(`Madora Sync test CLI

Usage:
  bun run madora-sync:test status [--state-file <path>]
  bun run madora-sync:test pair [--state-file <path>] [--device-id <id>] [--device-name <name>] [--platform <name>] [--use-code]
  bun run madora-sync:test disconnect [--state-file <path>]
  bun run madora-sync:test unpair --device-id <id> [--state-file <path>]

Examples:
  bun run madora-sync:test status
  bun run madora-sync:test pair --device-name "CLI Test Phone"
  bun run madora-sync:test pair --use-code
  bun run madora-sync:test unpair --device-id cli-test-device
`);
}

function parseArgs(argv) {
	const positionals = [];
	const flags = new Map();

	for (let index = 0; index < argv.length; index += 1) {
		const argument = argv[index];
		if (!argument.startsWith('--')) {
			positionals.push(argument);
			continue;
		}

		const key = argument.slice(2);
		const next = argv[index + 1];
		if (!next || next.startsWith('--')) {
			flags.set(key, true);
			continue;
		}

		flags.set(key, next);
		index += 1;
	}

	return { positionals, flags };
}

async function pathExists(targetPath) {
	try {
		await access(targetPath);
		return true;
	} catch {
		return false;
	}
}

async function readTauriConfig() {
	const raw = await readFile(TAURI_CONFIG_PATH, 'utf8');
	return JSON.parse(raw);
}

function candidateStatePaths(identifier) {
	const homeDir = os.homedir();
	const xdgDataHome =
		process.env.XDG_DATA_HOME || path.join(homeDir, '.local', 'share');
	const windowsAppData =
		process.env.APPDATA || path.join(homeDir, 'AppData', 'Roaming');
	const macosAppSupport = path.join(homeDir, 'Library', 'Application Support');

	return [
		path.join(xdgDataHome, identifier, STATE_FILE_NAME),
		path.join(macosAppSupport, identifier, STATE_FILE_NAME),
		path.join(windowsAppData, identifier, STATE_FILE_NAME),
		path.join(REPO_ROOT, STATE_FILE_NAME),
		path.join(REPO_ROOT, 'src-tauri', STATE_FILE_NAME),
	];
}

async function resolveStatePath(explicitStatePath) {
	if (explicitStatePath) {
		return path.resolve(explicitStatePath);
	}

	const tauriConfig = await readTauriConfig();
	const candidates = candidateStatePaths(tauriConfig.identifier);

	for (const candidate of candidates) {
		if (await pathExists(candidate)) {
			return candidate;
		}
	}

	throw new Error(
		[
			`Unable to find ${STATE_FILE_NAME}.`,
			'Pass --state-file explicitly or launch Madora once so it creates the file.',
			`Checked: ${candidates.join(', ')}`,
		].join(' ')
	);
}

function defaultState() {
	return {
		enabled: false,
		role: 'host',
		deviceName: 'Madora Desktop',
		port: 3210,
		autoStartServer: true,
		allowLanDiscovery: true,
		shareAiCompletions: true,
		connectionState: 'disconnected',
		lastSyncAt: null,
		lastError: null,
		activePairingId: null,
		activePairingToken: null,
		activePairingCode: null,
		pairingCodeExpiresAt: null,
		pairedDevices: [],
	};
}

function normalizeState(state) {
	return {
		...defaultState(),
		...state,
		pairedDevices: Array.isArray(state?.pairedDevices)
			? state.pairedDevices
			: [],
	};
}

async function loadState(statePath) {
	const raw = await readFile(statePath, 'utf8');
	return normalizeState(JSON.parse(raw));
}

async function saveState(statePath, state) {
	await mkdir(path.dirname(statePath), { recursive: true });
	await writeFile(statePath, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
}

function clearActivePairing(state) {
	state.activePairingId = null;
	state.activePairingToken = null;
	state.activePairingCode = null;
	state.pairingCodeExpiresAt = null;
}

function expirePairingIfNeeded(state) {
	if (!state.pairingCodeExpiresAt) return false;

	const expiresAt = Date.parse(state.pairingCodeExpiresAt);
	if (Number.isNaN(expiresAt)) return false;
	if (expiresAt > Date.now()) return false;

	clearActivePairing(state);
	return true;
}

function printStatus(statePath, state) {
	console.log(`stateFile: ${statePath}`);
	console.log(`enabled: ${state.enabled}`);
	console.log(`connectionState: ${state.connectionState}`);
	console.log(`pairedDevices: ${state.pairedDevices.length}`);
	console.log(
		`activePairing: ${state.activePairingId ? 'present' : 'missing'}`
	);
	if (state.activePairingCode) {
		console.log(`pairingCode: ${state.activePairingCode}`);
	}
	if (state.pairingCodeExpiresAt) {
		console.log(`pairingExpiresAt: ${state.pairingCodeExpiresAt}`);
	}
	if (state.lastSyncAt) {
		console.log(`lastSyncAt: ${state.lastSyncAt}`);
	}
	if (state.lastError) {
		console.log(`lastError: ${state.lastError}`);
	}

	for (const device of state.pairedDevices) {
		console.log(
			[
				`device: ${device.id}`,
				`name=${device.name}`,
				`platform=${device.platform ?? 'unknown'}`,
				`trusted=${device.trusted ? 'yes' : 'no'}`,
				`lastSeenAt=${device.lastSeenAt ?? 'never'}`,
			].join(' ')
		);
	}
}

async function runStatus(statePath) {
	const state = await loadState(statePath);
	const expired = expirePairingIfNeeded(state);
	if (expired) {
		await saveState(statePath, state);
	}
	printStatus(statePath, state);
}

async function runPair(statePath, flags) {
	const state = await loadState(statePath);
	const expired = expirePairingIfNeeded(state);
	if (expired) {
		await saveState(statePath, state);
	}

	if (!state.enabled) {
		throw new Error(
			'Madora Sync is disabled. Enable device collaboration first.'
		);
	}
	if (!state.activePairingId) {
		throw new Error(
			'No active pairing ticket. Generate a QR/code in Madora first.'
		);
	}

	const useCode = flags.get('use-code') === true;
	const deviceId =
		flags.get('device-id')?.toString() || `cli-test-${Date.now()}`;
	const deviceName = flags.get('device-name')?.toString() || 'CLI Test Device';
	const platform = flags.get('platform')?.toString() || 'cli';

	const tokenMatches = useCode
		? false
		: typeof state.activePairingToken === 'string' &&
			state.activePairingToken.length > 0;
	const codeMatches = useCode
		? typeof state.activePairingCode === 'string' &&
			state.activePairingCode.length > 0
		: false;

	if (!tokenMatches && !codeMatches) {
		throw new Error('Pairing credentials are missing or invalid.');
	}

	const pairedAt = new Date().toISOString();
	const device = {
		id: deviceId,
		name: deviceName,
		platform,
		lastSeenAt: pairedAt,
		trusted: true,
		authToken: state.activePairingToken,
	};

	state.pairedDevices = state.pairedDevices.filter(
		(existing) => existing.id !== device.id
	);
	state.pairedDevices.push(device);
	clearActivePairing(state);
	state.connectionState = 'connected';
	state.lastSyncAt = pairedAt;
	state.lastError = null;

	await saveState(statePath, state);

	console.log('pairing: success');
	console.log(`deviceId: ${device.id}`);
	console.log(`deviceName: ${device.name}`);
	console.log(`authMode: ${useCode ? 'code' : 'token'}`);
	console.log(`stateFile: ${statePath}`);
}

async function runDisconnect(statePath) {
	const state = await loadState(statePath);
	state.connectionState = 'disconnected';
	state.lastError = null;
	await saveState(statePath, state);

	console.log('disconnect: success');
	console.log(`stateFile: ${statePath}`);
}

async function runUnpair(statePath, flags) {
	const deviceId = flags.get('device-id')?.toString();
	if (!deviceId) {
		throw new Error('unpair requires --device-id <id>.');
	}

	const state = await loadState(statePath);
	const before = state.pairedDevices.length;
	state.pairedDevices = state.pairedDevices.filter(
		(device) => device.id !== deviceId
	);

	if (state.pairedDevices.length === 0) {
		state.connectionState = 'disconnected';
	}

	await saveState(statePath, state);

	console.log(
		before === state.pairedDevices.length ? 'unpair: no-op' : 'unpair: success'
	);
	console.log(`deviceId: ${deviceId}`);
	console.log(`stateFile: ${statePath}`);
}

async function main() {
	const { positionals, flags } = parseArgs(process.argv.slice(2));
	const command = positionals[0];

	if (!command || command === 'help' || command === '--help') {
		printHelp();
		return;
	}

	const statePath = await resolveStatePath(flags.get('state-file')?.toString());

	switch (command) {
		case 'status':
			await runStatus(statePath);
			return;
		case 'pair':
			await runPair(statePath, flags);
			return;
		case 'disconnect':
			await runDisconnect(statePath);
			return;
		case 'unpair':
			await runUnpair(statePath, flags);
			return;
		default:
			throw new Error(`Unknown command: ${command}`);
	}
}

await main().catch((error) => {
	console.error(`madora-sync-test: ${error.message}`);
	process.exitCode = 1;
});
