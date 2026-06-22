import create from 'zustand';
import { useEffect, type ReactNode } from 'react';
import i18n from '@/i18n';
import {
	isSupportedLocale,
	resolveLocalePreference,
	type LocalePreference,
} from '@/i18n/locale';
import { setAppLocale } from '@/invoke/system';

export type SaveMode = 'auto' | 'manual';

type AppSettingsState = {
	localePreference: LocalePreference;
	saveMode: SaveMode;
	showHiddenFiles: boolean;
	editorFontSize: number;
};

type AppSettingsActions = {
	setLocalePreference: (localePreference: LocalePreference) => void;
	setSaveMode: (saveMode: SaveMode) => void;
	setShowHiddenFiles: (showHiddenFiles: boolean) => void;
	setEditorFontSize: (editorFontSize: number) => void;
};

export type AppSettingsStore = AppSettingsState & AppSettingsActions;

const APP_LOCALE_STORAGE_KEY = 'madora-app-locale';
const EDITOR_SAVE_MODE_STORAGE_KEY = 'madora-editor-save-mode';
const EXPLORER_SHOW_HIDDEN_FILES_STORAGE_KEY =
	'madora-explorer-show-hidden-files';
const EDITOR_FONT_SIZE_STORAGE_KEY = 'madora-editor-font-size';

export const DEFAULT_EDITOR_FONT_SIZE = 14;
export const MIN_EDITOR_FONT_SIZE = 12;
export const MAX_EDITOR_FONT_SIZE = 24;

function getStoredValue(key: string): string | null {
	if (typeof window === 'undefined') {
		return null;
	}
	return window.localStorage.getItem(key);
}

function setStoredValue(key: string, value: string) {
	try {
		window.localStorage.setItem(key, value);
	} catch {
		/* ignore */
	}
}

function getInitialLocalePreference(): LocalePreference {
	const storedValue = getStoredValue(APP_LOCALE_STORAGE_KEY);
	if (storedValue === 'system') {
		return 'system';
	}
	return isSupportedLocale(storedValue) ? storedValue : 'system';
}

function getInitialSaveMode(): SaveMode {
	const storedValue = getStoredValue(EDITOR_SAVE_MODE_STORAGE_KEY);
	return storedValue === 'manual' ? 'manual' : 'auto';
}

function getInitialShowHiddenFiles(): boolean {
	const storedValue = getStoredValue(EXPLORER_SHOW_HIDDEN_FILES_STORAGE_KEY);
	if (storedValue === null) {
		return false;
	}
	return storedValue === 'true';
}

function clampEditorFontSize(editorFontSize: number): number {
	return Math.min(
		MAX_EDITOR_FONT_SIZE,
		Math.max(MIN_EDITOR_FONT_SIZE, Math.round(editorFontSize))
	);
}

function getInitialEditorFontSize(): number {
	const storedValue = Number.parseInt(
		getStoredValue(EDITOR_FONT_SIZE_STORAGE_KEY) ?? '',
		10
	);
	if (Number.isNaN(storedValue)) {
		return DEFAULT_EDITOR_FONT_SIZE;
	}
	return clampEditorFontSize(storedValue);
}

const useAppSettingsStore = create<AppSettingsStore>((set) => ({
	localePreference: getInitialLocalePreference(),
	saveMode: getInitialSaveMode(),
	showHiddenFiles: getInitialShowHiddenFiles(),
	editorFontSize: getInitialEditorFontSize(),

	setLocalePreference: (localePreference) => {
		set({ localePreference });
		setStoredValue(APP_LOCALE_STORAGE_KEY, localePreference);
	},
	setSaveMode: (saveMode) => {
		set({ saveMode });
		setStoredValue(EDITOR_SAVE_MODE_STORAGE_KEY, saveMode);
	},
	setShowHiddenFiles: (showHiddenFiles) => {
		set({ showHiddenFiles });
		setStoredValue(
			EXPLORER_SHOW_HIDDEN_FILES_STORAGE_KEY,
			String(showHiddenFiles)
		);
	},
	setEditorFontSize: (editorFontSize) => {
		const nextFontSize = clampEditorFontSize(editorFontSize);
		set({ editorFontSize: nextFontSize });
		setStoredValue(EDITOR_FONT_SIZE_STORAGE_KEY, String(nextFontSize));
	},
}));

export { useAppSettingsStore };

export function AppSettingsProvider({ children }: { children: ReactNode }) {
	const localePreference = useAppSettingsStore((s) => s.localePreference);

	useEffect(() => {
		const applyLocale = () => {
			const resolvedLocale = resolveLocalePreference(localePreference);
			void i18n.changeLanguage(resolvedLocale);
			void setAppLocale(resolvedLocale).catch(() => {});
		};

		applyLocale();

		if (localePreference !== 'system' || typeof window === 'undefined') {
			return;
		}

		window.addEventListener('languagechange', applyLocale);
		return () => {
			window.removeEventListener('languagechange', applyLocale);
		};
	}, [localePreference]);

	return <>{children}</>;
}

export function useAppSettings(): AppSettingsStore {
	return useAppSettingsStore();
}
