import { vi } from 'vitest';
import '@testing-library/jest-dom/vitest';

// ── DOM API polyfills for test environment ──────────────────────────────
// @base-ui/react and other UI libs rely on APIs that jsdom/happy-dom lack.

if (typeof HTMLElement !== 'undefined') {
	HTMLElement.prototype.getAnimations = vi.fn(() => []);
}

if (typeof ResizeObserver === 'undefined') {
	class ResizeObserverMock {
		observe() {}
		unobserve() {}
		disconnect() {}
	}
	vi.stubGlobal('ResizeObserver', ResizeObserverMock);
}

if (typeof IntersectionObserver === 'undefined') {
	class IntersectionObserverMock {
		observe() {}
		unobserve() {}
		disconnect() {}
	}
	vi.stubGlobal('IntersectionObserver', IntersectionObserverMock);
}

vi.stubGlobal(
	'matchMedia',
	vi.fn().mockImplementation((query: string) => ({
		matches: false,
		media: query,
		onchange: null,
		addListener: vi.fn(),
		removeListener: vi.fn(),
		addEventListener: vi.fn(),
		removeEventListener: vi.fn(),
		dispatchEvent: vi.fn(),
	}))
);

if (typeof Element !== 'undefined' && !Element.prototype.scrollTo) {
	Element.prototype.scrollTo = vi.fn();
}

// ── Tauri invoke mock ──────────────────────────────────────────────────

class ChannelMock<T = unknown> {
	id = 0;
	onmessage: (response: T) => void;

	constructor(onmessage?: (response: T) => void) {
		this.onmessage = onmessage ?? (() => undefined);
	}

	toJSON() {
		return '__CHANNEL__:0';
	}
}

vi.mock('@tauri-apps/api/core', () => ({
	Channel: ChannelMock,
	invoke: vi.fn(),
}));

vi.mock('@tauri-apps/api/webview', () => ({
	getCurrentWebview: () => ({
		setZoom: vi.fn(() => Promise.resolve()),
	}),
}));
