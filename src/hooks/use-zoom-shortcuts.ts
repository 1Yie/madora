import { useEffect } from 'react';
import {
	DEFAULT_ZOOM_LEVEL,
	stepZoomLevel,
	useWorkspace,
} from '@/context/workspace-provider';

/**
 * Bind webview zoom shortcuts (browser-style).
 *
 * - Ctrl/Cmd + = / +  → step zoom in
 * - Ctrl/Cmd + -      → step zoom out
 * - Ctrl/Cmd + 0      → reset to 100%
 *
 * Zoom is discrete (小 / 中 / 大), so +/- steps between fixed levels
 * rather than scaling continuously.
 */
export function useZoomShortcuts() {
	const { zoomLevel, setZoomLevel } = useWorkspace();

	useEffect(() => {
		const onKeyDown = (event: KeyboardEvent) => {
			const mod = event.ctrlKey || event.metaKey;
			if (!mod) return;

			const key = event.key;
			if (key !== '=' && key !== '+' && key !== '-' && key !== '0') return;

			event.preventDefault();

			if (key === '0') {
				setZoomLevel(DEFAULT_ZOOM_LEVEL);
				return;
			}

			setZoomLevel(stepZoomLevel(zoomLevel, key === '-' ? -1 : 1));
		};

		window.addEventListener('keydown', onKeyDown);
		return () => window.removeEventListener('keydown', onKeyDown);
	}, [zoomLevel, setZoomLevel]);
}
