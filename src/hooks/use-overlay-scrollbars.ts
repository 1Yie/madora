import { OverlayScrollbars } from 'overlayscrollbars';
import { useEffect } from 'react';

export const useOverlayScrollbars = () => {
	useEffect(() => {
		const initScrollbars = () => {
			const elements = [
				...document.querySelectorAll('.overflow-auto'),
				...document.querySelectorAll('.overflow-y-auto'),
				...document.querySelectorAll('.overflow-x-auto'),
			].filter(Boolean) as HTMLElement[];

			const seen = new Set<HTMLElement>();
			for (const el of elements) {
				if (seen.has(el)) continue;
				seen.add(el);

				if (!el.hasAttribute('data-overlayscrollbars-initialize')) {
					OverlayScrollbars(el, {
						scrollbars: {
							theme: 'os-theme-madora',
							autoHide: 'leave',
						},
					});
					el.setAttribute('data-overlayscrollbars-initialize', 'true');
				}
			}
		};

		initScrollbars();

		const observer = new MutationObserver(() => {
			requestAnimationFrame(initScrollbars);
		});

		observer.observe(document.body, {
			childList: true,
			subtree: true,
			attributes: true,
			attributeFilter: ['class'],
		});

		return () => {
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
