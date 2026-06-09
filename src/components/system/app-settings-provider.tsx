import {
	createContext,
	useContext,
	useEffect,
	useMemo,
	useState,
	type ReactNode,
} from 'react';

export type SaveMode = 'auto' | 'manual';

type AppSettingsContextValue = {
	saveMode: SaveMode;
	showHiddenFiles: boolean;

	setSaveMode: (saveMode: SaveMode) => void;
	setShowHiddenFiles: (showHiddenFiles: boolean) => void;
};

const EDITOR_SAVE_MODE_STORAGE_KEY = 'madora-editor-save-mode';
const EXPLORER_SHOW_HIDDEN_FILES_STORAGE_KEY =
	'madora-explorer-show-hidden-files';

const AppSettingsContext = createContext<AppSettingsContextValue | null>(null);

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

export function AppSettingsProvider({ children }: { children: ReactNode }) {
	const [saveMode, setSaveMode] = useState<SaveMode>(getInitialSaveMode);
	const [showHiddenFiles, setShowHiddenFiles] = useState<boolean>(
		getInitialShowHiddenFiles
	);

	useEffect(() => {
		window.localStorage.setItem(EDITOR_SAVE_MODE_STORAGE_KEY, saveMode);
	}, [saveMode]);

	useEffect(() => {
		window.localStorage.setItem(
			EXPLORER_SHOW_HIDDEN_FILES_STORAGE_KEY,
			String(showHiddenFiles)
		);
	}, [showHiddenFiles]);

	const value = useMemo<AppSettingsContextValue>(
		() => ({
			saveMode,
			showHiddenFiles,
			setSaveMode,
			setShowHiddenFiles,
		}),
		[saveMode, showHiddenFiles]
	);

	return (
		<AppSettingsContext.Provider value={value}>
			{children}
		</AppSettingsContext.Provider>
	);
}

export function useAppSettings() {
	const context = useContext(AppSettingsContext);
	if (!context) {
		throw new Error('useAppSettings must be used within AppSettingsProvider');
	}
	return context;
}
