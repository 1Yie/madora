import { OverlayScrollbars } from 'overlayscrollbars';
import { useEffect } from 'react';

export const useOverlayScrollbars = () => {
	useEffect(() => {
		let frameId: number | null = null;
		let disposed = false;

		// Match explicitly opted-in elements AND utility classes used by
		// UI primitives (sheets, dialogs) that need custom scrollbars.
		const selector =
			'[data-os-scroll], .overflow-auto, .overflow-y-auto, .overflow-x-auto';

		const initScrollbars = () => {
			const elements = Array.from(
				document.querySelectorAll<HTMLElement>(selector)
			);

			const seen = new Set<HTMLElement>();
			for (const el of elements) {
				if (seen.has(el)) continue;
				seen.add(el);

				if (!el.isConnected || el.hasAttribute('data-no-os')) {
					continue;
				}

				// Skip elements nested inside an existing OverlayScrollbars
				// structure to prevent conflicting instances (e.g. an
				// .overflow-auto dialog inside a data-os-scroll host).
				if (el.closest('[data-overlayscrollbars]')) {
					continue;
				}

				const existingInstance = OverlayScrollbars(el);
				if (existingInstance) {
					existingInstance.update();
					continue;
				}

				// Let OverlayScrollbars create its own host → padding →
				// viewport structure so scrollbar elements are placed
				// OUTSIDE the scrollable viewport. This prevents the
				// scrollbar from twitching with content during GPU-
				// accelerated scrolling.
				OverlayScrollbars(el, {
					scrollbars: {
						theme: 'os-theme-madora',
						autoHide: 'leave',
					},
				});
				el.setAttribute('data-overlayscrollbars-initialize', 'true');
			}
		};

		const scheduleInitScrollbars = () => {
			if (frameId !== null) {
				cancelAnimationFrame(frameId);
			}

			frameId = requestAnimationFrame(() => {
				frameId = null;
				if (disposed) return;
				initScrollbars();
			});
		};

		initScrollbars();

		const observer = new MutationObserver(() => {
			scheduleInitScrollbars();
		});

		observer.observe(document.body, {
			childList: true,
			subtree: true,
			attributes: true,
			attributeFilter: ['class', 'style', 'data-os-scroll', 'data-no-os'],
		});

		return () => {
			disposed = true;
			if (frameId !== null) {
				cancelAnimationFrame(frameId);
			}
			observer.disconnect();
			document
				.querySelectorAll('[data-overlayscrollbars-initialize]')
				.forEach((element) => {
					const instance = OverlayScrollbars(element as HTMLElement);
					if (instance) {
						instance.destroy();
					}
				});
		};
	}, []);
};
