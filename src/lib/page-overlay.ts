import { useEffect, useSyncExternalStore } from 'react';

/**
 * Tracks full-window pages (settings, git, webdav) layered over the
 * workspace, so the app title bar can collapse to floating window controls.
 */
let openCount = 0;
const listeners = new Set<() => void>();

function emit() {
	listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
	listeners.add(listener);
	return () => {
		listeners.delete(listener);
	};
}

export function usePageOverlayOpen(): boolean {
	return useSyncExternalStore(
		subscribe,
		() => openCount > 0,
		() => false
	);
}

export function useRegisterPageOverlay(active: boolean) {
	useEffect(() => {
		if (!active) return;
		openCount += 1;
		emit();
		return () => {
			openCount -= 1;
			emit();
		};
	}, [active]);
}
