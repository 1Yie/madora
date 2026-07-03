import {
	createContext,
	useCallback,
	useContext,
	useEffect,
	useMemo,
	useState,
	type ReactNode,
} from 'react';
import * as SecureStore from 'expo-secure-store';
import { useColorScheme, type ColorSchemeName } from 'react-native';

import i18n from '@/i18n';
import {
	type AppLocale,
	SUPPORTED_LOCALES,
	detectSystemLocale,
	isSupportedLocale,
} from '@/i18n/locale';

export const DEFAULT_EDITOR_FONT_SIZE = 14;
export const MIN_EDITOR_FONT_SIZE = 12;
export const MAX_EDITOR_FONT_SIZE = 22;

export type LocalePreference = 'system' | AppLocale;
export type SaveMode = 'auto' | 'manual';
export type ThemePreference = 'system' | 'light' | 'dark';
export type ResolvedThemePreference = Exclude<ThemePreference, 'system'>;
export type AppThemePalette = {
	accentForeground: string;
	accentSurface: string;
	background: string;
	border: string;
	foreground: string;
	icon: string;
	iconMuted: string;
	mutedForeground: string;
	surface: string;
	surfaceMuted: string;
};

export const APP_THEME_BACKGROUND_COLORS: Record<
	ResolvedThemePreference,
	string
> = {
	dark: '#0a0a0a',
	light: '#ffffff',
};

const APP_THEME_PALETTES: Record<ResolvedThemePreference, AppThemePalette> = {
	dark: {
		accentForeground: '#171717',
		accentSurface: '#f5f5f5',
		background: '#0a0a0a',
		border: '#2e2e2e',
		foreground: '#fafafa',
		icon: '#f5f5f5',
		iconMuted: '#a3a3a3',
		mutedForeground: '#a3a3a3',
		surface: '#171717',
		surfaceMuted: '#262626',
	},
	light: {
		accentForeground: '#fbfcff',
		accentSurface: '#111827',
		background: '#ffffff',
		border: '#e5e5e5',
		foreground: '#0a0a0a',
		icon: '#111827',
		iconMuted: '#6b7280',
		mutedForeground: '#737373',
		surface: '#ffffff',
		surfaceMuted: '#f5f5f5',
	},
};

type AppSettingsContextValue = {
	editorFontSize: number;
	localePreference: LocalePreference;
	saveMode: SaveMode;
	themePreference: ThemePreference;
	setEditorFontSize: (fontSize: number) => void;
	setLocalePreference: (locale: LocalePreference) => void;
	setSaveMode: (saveMode: SaveMode) => void;
	setThemePreference: (theme: ThemePreference) => void;
};

const SETTINGS_PREFIX = 'madora-mobile.settings';
const EDITOR_FONT_SIZE_KEY = `${SETTINGS_PREFIX}.editorFontSize`;
const LOCALE_KEY = `${SETTINGS_PREFIX}.locale`;
const SAVE_MODE_KEY = `${SETTINGS_PREFIX}.saveMode`;
const THEME_KEY = `${SETTINGS_PREFIX}.theme`;

const AppSettingsContext = createContext<AppSettingsContextValue | null>(null);

function clampEditorFontSize(value: number) {
	return Math.min(MAX_EDITOR_FONT_SIZE, Math.max(MIN_EDITOR_FONT_SIZE, value));
}

function isLocalePreference(value: string | null): value is LocalePreference {
	return value === 'system' || isSupportedLocale(value);
}

function isSaveMode(value: string | null): value is SaveMode {
	return value === 'auto' || value === 'manual';
}

function isThemePreference(value: string | null): value is ThemePreference {
	return value === 'system' || value === 'light' || value === 'dark';
}

async function getStoredValue(key: string) {
	try {
		return await SecureStore.getItemAsync(key);
	} catch {
		return null;
	}
}

async function setStoredValue(key: string, value: string) {
	try {
		await SecureStore.setItemAsync(key, value);
	} catch {
		// Settings still work for the current session if persistence fails.
	}
}

function resolveLocalePreference(locale: LocalePreference): AppLocale {
	return locale === 'system' ? detectSystemLocale() : locale;
}

export function resolveThemePreference(
	theme: ThemePreference,
	systemColorScheme: ColorSchemeName
): ResolvedThemePreference {
	if (theme === 'system') {
		return systemColorScheme === 'dark' ? 'dark' : 'light';
	}

	return theme;
}

export function AppSettingsProvider({ children }: { children: ReactNode }) {
	const [editorFontSize, setEditorFontSizeState] = useState(
		DEFAULT_EDITOR_FONT_SIZE
	);
	const [localePreference, setLocalePreferenceState] =
		useState<LocalePreference>('system');
	const [saveMode, setSaveModeState] = useState<SaveMode>('auto');
	const [themePreference, setThemePreferenceState] =
		useState<ThemePreference>('system');

	useEffect(() => {
		let cancelled = false;

		async function hydrate() {
			const [storedFontSize, storedLocale, storedSaveMode, storedTheme] =
				await Promise.all([
					getStoredValue(EDITOR_FONT_SIZE_KEY),
					getStoredValue(LOCALE_KEY),
					getStoredValue(SAVE_MODE_KEY),
					getStoredValue(THEME_KEY),
				]);

			if (cancelled) return;

			const parsedFontSize = Number(storedFontSize);
			if (storedFontSize !== null && Number.isFinite(parsedFontSize)) {
				setEditorFontSizeState(clampEditorFontSize(parsedFontSize));
			}
			if (isLocalePreference(storedLocale)) {
				setLocalePreferenceState(storedLocale);
				void i18n.changeLanguage(resolveLocalePreference(storedLocale));
			}
			if (isSaveMode(storedSaveMode)) {
				setSaveModeState(storedSaveMode);
			}
			if (isThemePreference(storedTheme)) {
				setThemePreferenceState(storedTheme);
			}
		}

		void hydrate();

		return () => {
			cancelled = true;
		};
	}, []);

	const setEditorFontSize = useCallback((fontSize: number) => {
		const nextFontSize = clampEditorFontSize(Math.round(fontSize));
		setEditorFontSizeState(nextFontSize);
		void setStoredValue(EDITOR_FONT_SIZE_KEY, String(nextFontSize));
	}, []);

	const setLocalePreference = useCallback((locale: LocalePreference) => {
		setLocalePreferenceState(locale);
		void setStoredValue(LOCALE_KEY, locale);
		void i18n.changeLanguage(resolveLocalePreference(locale));
	}, []);

	const setSaveMode = useCallback((nextSaveMode: SaveMode) => {
		setSaveModeState(nextSaveMode);
		void setStoredValue(SAVE_MODE_KEY, nextSaveMode);
	}, []);

	const setThemePreference = useCallback((theme: ThemePreference) => {
		setThemePreferenceState(theme);
		void setStoredValue(THEME_KEY, theme);
	}, []);

	const value = useMemo<AppSettingsContextValue>(
		() => ({
			editorFontSize,
			localePreference,
			saveMode,
			setEditorFontSize,
			setLocalePreference,
			setSaveMode,
			setThemePreference,
			themePreference,
		}),
		[
			editorFontSize,
			localePreference,
			saveMode,
			setEditorFontSize,
			setLocalePreference,
			setSaveMode,
			setThemePreference,
			themePreference,
		]
	);

	return (
		<AppSettingsContext.Provider value={value}>
			{children}
		</AppSettingsContext.Provider>
	);
}

export function useAppSettings() {
	const value = useContext(AppSettingsContext);
	if (!value) {
		throw new Error('useAppSettings must be used within AppSettingsProvider');
	}
	return value;
}

export function useResolvedThemePreference(): ResolvedThemePreference {
	const systemColorScheme = useColorScheme();
	const { themePreference } = useAppSettings();

	return resolveThemePreference(themePreference, systemColorScheme);
}

export function getAppThemePalette(
	theme: ResolvedThemePreference
): AppThemePalette {
	return APP_THEME_PALETTES[theme];
}

export function useAppThemePalette(): AppThemePalette {
	return getAppThemePalette(useResolvedThemePreference());
}

export function getLocalePreferenceOptions(): LocalePreference[] {
	return ['system', ...SUPPORTED_LOCALES];
}
