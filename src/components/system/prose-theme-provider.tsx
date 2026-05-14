import {
	createContext,
	useCallback,
	useContext,
	useEffect,
	useState,
} from 'react';
import type { ReactNode } from 'react';
import { PROSE_THEME_DEFAULTS } from '@/lib/prose-theme-defaults';

type ProseThemeContextValue = {
	customCss: string;
	setCustomCss: (css: string) => void;
	resetCss: () => void;
};

const ProseThemeContext = createContext<ProseThemeContextValue | null>(null);

const STORAGE_KEY = 'madora-prose-custom-css';
const STYLE_ID = 'prose-theme-style';

function getInitialCustomCss(): string {
	return window.localStorage.getItem(STORAGE_KEY) ?? '';
}

export function ProseThemeProvider({ children }: { children: ReactNode }) {
	const [customCss, setCustomCssState] = useState<string>(getInitialCustomCss);

	useEffect(() => {
		let styleEl = document.getElementById(STYLE_ID) as HTMLStyleElement | null;
		if (!styleEl) {
			styleEl = document.createElement('style');
			styleEl.id = STYLE_ID;
			document.head.appendChild(styleEl);
		}
		styleEl.textContent = PROSE_THEME_DEFAULTS + (customCss || '');
	}, [customCss]);

	const setCustomCss = useCallback((css: string) => {
		setCustomCssState(css);
		try {
			window.localStorage.setItem(STORAGE_KEY, css);
		} catch {
			// ignore
		}
	}, []);

	const resetCss = useCallback(() => {
		setCustomCssState('');
		try {
			window.localStorage.removeItem(STORAGE_KEY);
		} catch {
			// ignore
		}
	}, []);

	return (
		<ProseThemeContext.Provider value={{ customCss, setCustomCss, resetCss }}>
			{children}
		</ProseThemeContext.Provider>
	);
}

export function useProseTheme() {
	const ctx = useContext(ProseThemeContext);
	if (!ctx)
		throw new Error('useProseTheme must be used within ProseThemeProvider');
	return ctx;
}
