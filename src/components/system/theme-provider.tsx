import {
	createContext,
	useContext,
	useEffect,
	useState,
	type ReactNode,
} from 'react';

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

type ThemeContextValue = {
	accentMode: AccentMode;
	resolvedTheme: ResolvedTheme;
	theme: Theme;
	setTheme: (theme: Theme) => void;
	toggleTheme: () => void;
	setAccentMode: (mode: AccentMode) => void;
	/** optional system accent color when available (eg. #RRGGBB) */
	systemAccent?: string | null;
	/** last selected preset/custom accent color */
	accent?: string | null;
	setAccent: (accent: string | null) => void;
	/** the final accent color that the UI should use (default/system/custom) */
	effectiveAccent?: string | null;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

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

function resolveTheme(theme: Theme, prefersDark: boolean): ResolvedTheme {
	if (theme === 'system') {
		return prefersDark ? 'dark' : 'light';
	}
	return theme;
}
export function ThemeProvider({ children }: { children: ReactNode }) {
	const [theme, setTheme] = useState<Theme>(getInitialTheme);
	const prefersDark = useMediaQuery('(prefers-color-scheme: dark)');
	const [systemAccent, setSystemAccent] = useState<string | null>(null);

	function getInitialAccent(): string | null {
		if (typeof window === 'undefined') return null;
		const v = window.localStorage.getItem(ACCENT_STORAGE_KEY);
		return normalizeHexColor(v);
	}

	const [accentMode, setAccentModeState] =
		useState<AccentMode>(getInitialAccentMode);
	const [accent, setAccentState] = useState<string | null>(getInitialAccent);
	const effectivePrefersDark = prefersDark;
	const resolvedTheme = resolveTheme(theme, effectivePrefersDark);

	const effectiveAccent =
		accentMode === 'custom'
			? accent
			: accentMode === 'system'
				? (systemAccent ?? null)
				: null;

	useEffect(() => {
		const root = document.documentElement;

		root.classList.toggle('dark', resolvedTheme === 'dark');
		root.style.colorScheme = resolvedTheme;
		window.localStorage.setItem(THEME_STORAGE_KEY, theme);
	}, [resolvedTheme, theme]);

	// Request the system accent color when it's needed.
	useEffect(() => {
		let mounted = true;

		if (theme !== 'system' && accentMode !== 'system') {
			return;
		}

		void (async () => {
			try {
				const resp = await getSystemTheme();

				if (!mounted) return;
				setSystemAccent(normalizeHexColor(resp.accent) ?? null);
			} catch (e) {
				// ignore failures and fall back to CSS media query
				console.warn('get_system_theme failed:', e);
			}
		})();

		return () => {
			mounted = false;
		};
	}, [theme, accentMode]);

	// Expose the raw system accent and derive the app's color tokens from the
	// resolved theme color so buttons, selection states, sidebars, and focus
	// rings stay in sync.
	useEffect(() => {
		const root = document.documentElement;

		if (systemAccent) {
			root.style.setProperty('--system-accent', systemAccent);
		} else {
			root.style.removeProperty('--system-accent');
		}

		if (!effectiveAccent) {
			for (const variable of THEME_COLOR_VARIABLES) {
				root.style.removeProperty(variable);
			}

			return;
		}

		const normalizedAccent = normalizeHexColor(effectiveAccent);

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
	}, [systemAccent, effectiveAccent, resolvedTheme]);

	// persist explicit user accent selection
	useEffect(() => {
		try {
			if (accent) {
				window.localStorage.setItem(ACCENT_STORAGE_KEY, accent);
			} else {
				window.localStorage.removeItem(ACCENT_STORAGE_KEY);
			}
		} catch (e) {
			console.warn('Failed to persist accent selection:', e);
		}
	}, [accent]);

	useEffect(() => {
		try {
			window.localStorage.setItem(ACCENT_MODE_STORAGE_KEY, accentMode);
		} catch (e) {
			console.warn('Failed to persist accent mode selection:', e);
		}
	}, [accentMode]);

	return (
		<ThemeContext.Provider
			value={{
				accentMode,
				resolvedTheme,
				theme,
				setTheme,
				setAccentMode: (mode: AccentMode) => setAccentModeState(mode),
				toggleTheme: () => {
					setTheme((currentTheme) =>
						resolveTheme(currentTheme, effectivePrefersDark) === 'dark'
							? 'light'
							: 'dark'
					);
				},
				systemAccent,
				accent,
				setAccent: (a: string | null) => {
					if (a === null) {
						setAccentModeState('default');
						return;
					}

					const normalized = normalizeHexColor(a);

					if (!normalized) {
						return;
					}

					setAccentState(normalized);
					setAccentModeState('custom');
				},
				effectiveAccent,
			}}
		>
			{children}
		</ThemeContext.Provider>
	);
}

export function useTheme() {
	const context = useContext(ThemeContext);

	if (!context) {
		throw new Error('useTheme must be used within ThemeProvider');
	}

	return context;
}
