import create from 'zustand';
import type { ReactNode } from 'react';

export type SaveMode = 'auto' | 'manual';

type AppSettingsState = {
	saveMode: SaveMode;
	showHiddenFiles: boolean;
};

type AppSettingsActions = {
	setSaveMode: (saveMode: SaveMode) => void;
	setShowHiddenFiles: (showHiddenFiles: boolean) => void;
};

export type AppSettingsStore = AppSettingsState & AppSettingsActions;

const EDITOR_SAVE_MODE_STORAGE_KEY = 'madora-editor-save-mode';
const EXPLORER_SHOW_HIDDEN_FILES_STORAGE_KEY =
	'madora-explorer-show-hidden-files';

function getStoredValue(key: string): string | null {
	if (typeof window === 'undefined') {
		return null;
	}
	return window.localStorage.getItem(key);
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

const useAppSettingsStore = create<AppSettingsStore>((set) => ({
	saveMode: getInitialSaveMode(),
	showHiddenFiles: getInitialShowHiddenFiles(),

	setSaveMode: (saveMode) => {
		set({ saveMode });
		try {
			window.localStorage.setItem(EDITOR_SAVE_MODE_STORAGE_KEY, saveMode);
		} catch {
			/* ignore */
		}
	},
	setShowHiddenFiles: (showHiddenFiles) => {
		set({ showHiddenFiles });
		try {
			window.localStorage.setItem(
				EXPLORER_SHOW_HIDDEN_FILES_STORAGE_KEY,
				String(showHiddenFiles)
			);
		} catch {
			/* ignore */
		}
	},
}));

export { useAppSettingsStore };

export function AppSettingsProvider({ children }: { children: ReactNode }) {
	return <>{children}</>;
}

export function useAppSettings(): AppSettingsStore {
	return useAppSettingsStore();
}
