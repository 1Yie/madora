import create from 'zustand';
import { useEffect, useMemo, type ReactNode } from 'react';

import { getSystemTheme } from '@/invoke/system';

import { useMediaQuery } from '@/hooks/use-media-query';

export type Theme = 'system' | 'light' | 'dark';
export type ResolvedTheme = 'light' | 'dark';
export type AccentMode = 'default' | 'system' | 'custom';

const THEME_STORAGE_KEY = 'madora-theme';
const ACCENT_STORAGE_KEY = 'madora-theme-accent';
const ACCENT_MODE_STORAGE_KEY = 'madora-theme-accent-mode';
const THEME_COLOR_VARIABLES = [
	'--theme-accent',
	'--primary',
	'--primary-foreground',
	'--ring',
	'--accent',
	'--sidebar-primary',
	'--sidebar-primary-foreground',
	'--sidebar-accent',
	'--sidebar-ring',
] as const;

function normalizeHexColor(value: string | null | undefined): string | null {
	if (!value) {
		return null;
	}

	const trimmed = value.trim();

	if (!/^#(?:[\dA-Fa-f]{3}|[\dA-Fa-f]{6})$/.test(trimmed)) {
		return null;
	}

	if (trimmed.length === 4) {
		return `#${trimmed[1]}${trimmed[1]}${trimmed[2]}${trimmed[2]}${trimmed[3]}${trimmed[3]}`.toUpperCase();
	}

	return trimmed.toUpperCase();
}

function hexToRgb(hex: string) {
	const normalized = normalizeHexColor(hex);

	if (!normalized) {
		return null;
	}

	const value = normalized.slice(1);
	const channelSize = value.length / 3;

	return {
		b: parseInt(value.slice(channelSize * 2), 16),
		g: parseInt(value.slice(channelSize, channelSize * 2), 16),
		r: parseInt(value.slice(0, channelSize), 16),
	};
}

function getRelativeLuminance({
	r,
	g,
	b,
}: {
	r: number;
	g: number;
	b: number;
}) {
	const linearized = [r, g, b].map((channel) => {
		const value = channel / 255;
		return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
	});

	return (
		0.2126 * linearized[0] + 0.7152 * linearized[1] + 0.0722 * linearized[2]
	);
}

function getContrastRatio(a: number, b: number) {
	const lighter = Math.max(a, b);
	const darker = Math.min(a, b);
	return (lighter + 0.05) / (darker + 0.05);
}

function getContrastTextColor(hex: string) {
	const rgb = hexToRgb(hex);

	if (!rgb) {
		return '#FFFFFF';
	}

	const backgroundLuminance = getRelativeLuminance(rgb);
	const whiteContrast = getContrastRatio(backgroundLuminance, 1);
	const darkContrast = getContrastRatio(
		backgroundLuminance,
		getRelativeLuminance({ r: 15, g: 23, b: 42 })
	);

	return whiteContrast >= darkContrast ? '#FFFFFF' : '#0F172A';
}

function getOverlayColor(hex: string, alpha: number) {
	const rgb = hexToRgb(hex);

	if (!rgb) {
		return null;
	}

	return `rgb(${rgb.r} ${rgb.g} ${rgb.b} / ${alpha})`;
}

type ThemeState = {
	theme: Theme;
	accentMode: AccentMode;
	accent: string | null;
	systemAccent: string | null;
};

type ThemeActions = {
	setTheme: (theme: Theme) => void;
	setAccentMode: (mode: AccentMode) => void;
	setAccent: (accent: string | null) => void;
};

type ThemeStore = ThemeState & ThemeActions;

function getInitialTheme(): Theme {
	if (typeof window === 'undefined') {
		return 'system';
	}

	const storedTheme = window.localStorage.getItem(THEME_STORAGE_KEY);

	if (
		storedTheme === 'light' ||
		storedTheme === 'dark' ||
		storedTheme === 'system'
	) {
		return storedTheme;
	}

	return 'system';
}

function getInitialAccentMode(): AccentMode {
	if (typeof window === 'undefined') {
		return 'system';
	}

	const storedMode = window.localStorage.getItem(ACCENT_MODE_STORAGE_KEY);

	if (
		storedMode === 'default' ||
		storedMode === 'system' ||
		storedMode === 'custom'
	) {
		return storedMode;
	}

	return normalizeHexColor(window.localStorage.getItem(ACCENT_STORAGE_KEY))
		? 'custom'
		: 'system';
}

function getInitialAccent(): string | null {
	if (typeof window === 'undefined') return null;
	const v = window.localStorage.getItem(ACCENT_STORAGE_KEY);
	return normalizeHexColor(v);
}

const useThemeStore = create<ThemeStore>((set) => ({
	theme: getInitialTheme(),
	accentMode: getInitialAccentMode(),
	accent: getInitialAccent(),
	systemAccent: null,

	setTheme: (theme) => {
		set({ theme });
		try {
			window.localStorage.setItem(THEME_STORAGE_KEY, theme);
		} catch {
			/* ignore */
		}
	},

	setAccentMode: (mode) => {
		set({ accentMode: mode });
		try {
			window.localStorage.setItem(ACCENT_MODE_STORAGE_KEY, mode);
		} catch {
			/* ignore */
		}
	},

	setAccent: (accent) => {
		if (accent === null) {
			set({ accent: null, accentMode: 'default' });
			try {
				window.localStorage.setItem(ACCENT_MODE_STORAGE_KEY, 'default');
				window.localStorage.removeItem(ACCENT_STORAGE_KEY);
			} catch {
				/* ignore */
			}
			return;
		}

		const normalized = normalizeHexColor(accent);

		if (!normalized) {
			return;
		}

		set({ accent: normalized, accentMode: 'custom' });
		try {
			window.localStorage.setItem(ACCENT_MODE_STORAGE_KEY, 'custom');
			window.localStorage.setItem(ACCENT_STORAGE_KEY, normalized);
		} catch {
			/* ignore */
		}
	},
}));

export { useThemeStore };

export function ThemeProvider({ children }: { children: ReactNode }) {
	const prefersDark = useMediaQuery('(prefers-color-scheme: dark)');

	const theme = useThemeStore((s) => s.theme);
	const accentMode = useThemeStore((s) => s.accentMode);
	const accent = useThemeStore((s) => s.accent);
	const systemAccent = useThemeStore((s) => s.systemAccent);

	const resolvedTheme: ResolvedTheme =
		theme === 'system' ? (prefersDark ? 'dark' : 'light') : theme;

	// Apply dark/light class and color-scheme
	useEffect(() => {
		const root = document.documentElement;
		root.classList.toggle('dark', resolvedTheme === 'dark');
		root.style.colorScheme = resolvedTheme;
	}, [resolvedTheme]);

	// Fetch system accent color
	useEffect(() => {
		let mounted = true;

		if (theme !== 'system' && accentMode !== 'system') {
			return;
		}

		void (async () => {
			try {
				const resp = await getSystemTheme();

				if (!mounted) return;
				const systemAccent = normalizeHexColor(resp.accent) ?? null;
				useThemeStore.setState({ systemAccent });
			} catch (e) {
				console.warn('get_system_theme failed:', e);
			}
		})();

		return () => {
			mounted = false;
		};
	}, [theme, accentMode]);

	// Apply accent CSS variables
	useEffect(() => {
		const root = document.documentElement;
		const currentEffectiveAccent =
			accentMode === 'custom'
				? accent
				: accentMode === 'system'
					? systemAccent
					: null;

		if (systemAccent) {
			root.style.setProperty('--system-accent', systemAccent);
		} else {
			root.style.removeProperty('--system-accent');
		}

		if (!currentEffectiveAccent) {
			for (const variable of THEME_COLOR_VARIABLES) {
				root.style.removeProperty(variable);
			}

			return;
		}

		const normalizedAccent = normalizeHexColor(currentEffectiveAccent);

		if (!normalizedAccent) {
			for (const variable of THEME_COLOR_VARIABLES) {
				root.style.removeProperty(variable);
			}

			return;
		}

		const foreground = getContrastTextColor(normalizedAccent);
		const accentOverlay = getOverlayColor(
			normalizedAccent,
			resolvedTheme === 'dark' ? 0.22 : 0.14
		);
		const sidebarAccentOverlay = getOverlayColor(
			normalizedAccent,
			resolvedTheme === 'dark' ? 0.26 : 0.16
		);

		root.style.setProperty('--theme-accent', normalizedAccent);
		root.style.setProperty('--primary', normalizedAccent);
		root.style.setProperty('--primary-foreground', foreground);
		root.style.setProperty('--ring', normalizedAccent);
		root.style.setProperty('--accent', accentOverlay ?? normalizedAccent);
		root.style.setProperty('--sidebar-primary', normalizedAccent);
		root.style.setProperty('--sidebar-primary-foreground', foreground);
		root.style.setProperty(
			'--sidebar-accent',
			sidebarAccentOverlay ?? normalizedAccent
		);
		root.style.setProperty('--sidebar-ring', normalizedAccent);
	}, [accent, accentMode, resolvedTheme, systemAccent]);

	return <>{children}</>;
}

export function useTheme() {
	const prefersDark = useMediaQuery('(prefers-color-scheme: dark)');

	const theme = useThemeStore((s) => s.theme);
	const accentMode = useThemeStore((s) => s.accentMode);
	const accent = useThemeStore((s) => s.accent);
	const systemAccent = useThemeStore((s) => s.systemAccent);

	const resolvedTheme: ResolvedTheme =
		theme === 'system' ? (prefersDark ? 'dark' : 'light') : theme;

	const effectiveAccent =
		accentMode === 'custom'
			? accent
			: accentMode === 'system'
				? systemAccent
				: null;

	const { setTheme, setAccentMode, setAccent } = useThemeStore.getState();

	return useMemo(
		() => ({
			accent,
			accentMode,
			effectiveAccent,
			resolvedTheme,
			systemAccent,
			theme,

			setAccent,
			setAccentMode,
			setTheme,
			toggleTheme: () => {
				setTheme(resolvedTheme === 'dark' ? 'light' : 'dark');
			},
		}),
		[
			accent,
			accentMode,
			effectiveAccent,
			resolvedTheme,
			setAccent,
			setAccentMode,
			setTheme,
			systemAccent,
			theme,
		]
	);
}
