import { describe, expect, test } from 'bun:test';

import {
	buildWebSocketUrl,
	formatPairingEndpoint,
	formatSyncDisplayAddress,
	parsePairingEndpoint,
	type PairingPayload,
} from '../protocol';

describe('madora sync protocol helpers', () => {
	test('parses a local host with fallback port as ws', () => {
		expect(parsePairingEndpoint('192.168.1.20', 3210)).toEqual({
			host: '192.168.1.20',
			path: '',
			port: 3210,
			protocol: 'ws',
		});
	});

	test('maps http and https endpoints with the normal port input', () => {
		expect(parsePairingEndpoint('http://sync.example.test', 3210)).toEqual({
			host: 'sync.example.test',
			path: '',
			port: 3210,
			protocol: 'ws',
		});
		expect(parsePairingEndpoint('https://sync.example.test', 3210)).toEqual({
			host: 'sync.example.test',
			path: '',
			port: 3210,
			protocol: 'wss',
		});
	});

	test('rejects websocket schemes and URL paths in manual endpoints', () => {
		expect(parsePairingEndpoint('ws://sync.example.test', 3210)).toBeNull();
		expect(
			parsePairingEndpoint('https://sync.example.test/madora', 3210)
		).toBeNull();
	});

	test('formats display endpoints as http urls and connection urls as websocket urls', () => {
		const payload: PairingPayload = {
			code: '123456',
			deviceName: 'Madora Desktop',
			expiresAt: '2026-07-07T00:00:00Z',
			host: 'sync.example.test',
			pairingId: '',
			pairingToken: '',
			path: '/madora',
			port: 443,
			protocol: 'wss',
		};

		expect(formatPairingEndpoint(payload)).toBe(
			'https://sync.example.test:443'
		);
		expect(buildWebSocketUrl(payload)).toBe(
			'wss://sync.example.test:443/madora'
		);
	});

	test('formats stored websocket addresses as http display urls', () => {
		expect(formatSyncDisplayAddress('ws://192.168.1.20:3210')).toBe(
			'http://192.168.1.20:3210'
		);
		expect(formatSyncDisplayAddress('wss://sync.example.test:443')).toBe(
			'https://sync.example.test:443'
		);
	});
});
