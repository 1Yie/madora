import { useEffect } from 'react';
import type { ReactNode } from 'react';
import { PROSE_THEME_DEFAULTS } from '@/lib/prose-theme-defaults';

const STYLE_ID = 'prose-theme-style';

export function ProseThemeProvider({ children }: { children: ReactNode }) {
	useEffect(() => {
		let styleEl = document.getElementById(STYLE_ID) as HTMLStyleElement | null;
		if (!styleEl) {
			styleEl = document.createElement('style');
			styleEl.id = STYLE_ID;
			document.head.appendChild(styleEl);
		}
		styleEl.textContent = PROSE_THEME_DEFAULTS;
	}, []);

	return <>{children}</>;
}
