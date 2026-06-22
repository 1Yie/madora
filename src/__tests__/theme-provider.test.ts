import { cleanup, render, waitFor } from '@testing-library/react';
import { createElement } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { getSystemTheme } from '@/invoke/system';

vi.mock('@/invoke/system', () => ({
	getSystemTheme: vi.fn(),
}));

const ACCENT_STORAGE_KEY = 'madora-theme-accent';
const ACCENT_MODE_STORAGE_KEY = 'madora-theme-accent-mode';

async function loadThemeModule() {
	vi.resetModules();
	return import('@/context/theme-provider');
}

afterEach(() => {
	cleanup();
	document.documentElement.removeAttribute('style');
	document.documentElement.classList.remove('dark');
	window.localStorage.clear();
	vi.clearAllMocks();
	vi.resetModules();
});

describe('theme-provider persistence', () => {
	it('persists custom accent mode when switching from system to a custom color', async () => {
		window.localStorage.setItem(ACCENT_MODE_STORAGE_KEY, 'system');

		const { useThemeStore } = await loadThemeModule();
		useThemeStore.getState().setAccent('#0ea5e9');

		expect(window.localStorage.getItem(ACCENT_MODE_STORAGE_KEY)).toBe('custom');
		expect(window.localStorage.getItem(ACCENT_STORAGE_KEY)).toBe('#0EA5E9');

		const reloaded = await loadThemeModule();
		expect(reloaded.useThemeStore.getState().accentMode).toBe('custom');
		expect(reloaded.useThemeStore.getState().accent).toBe('#0EA5E9');
	});

	it('persists default accent mode when clearing a custom color', async () => {
		window.localStorage.setItem(ACCENT_MODE_STORAGE_KEY, 'custom');
		window.localStorage.setItem(ACCENT_STORAGE_KEY, '#7C3AED');

		const { useThemeStore } = await loadThemeModule();
		useThemeStore.getState().setAccent(null);

		expect(window.localStorage.getItem(ACCENT_MODE_STORAGE_KEY)).toBe(
			'default'
		);
		expect(window.localStorage.getItem(ACCENT_STORAGE_KEY)).toBeNull();

		const reloaded = await loadThemeModule();
		expect(reloaded.useThemeStore.getState().accentMode).toBe('default');
		expect(reloaded.useThemeStore.getState().accent).toBeNull();
	});

	it('applies the fetched system accent after the async lookup resolves', async () => {
		window.localStorage.setItem(ACCENT_MODE_STORAGE_KEY, 'system');
		vi.mocked(getSystemTheme).mockResolvedValue({
			scheme: 'dark',
			accent: '#3584E4',
		});

		const { ThemeProvider } = await loadThemeModule();
		render(createElement(ThemeProvider, null, createElement('div')));

		await waitFor(() => {
			expect(
				document.documentElement.style.getPropertyValue('--system-accent')
			).toBe('#3584E4');
			expect(
				document.documentElement.style.getPropertyValue('--theme-accent')
			).toBe('#3584E4');
		});
	});
});
