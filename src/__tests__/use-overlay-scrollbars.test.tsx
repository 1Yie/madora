import { cleanup, render, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { useOverlayScrollbars } from '@/hooks/use-overlay-scrollbars';
import { OverlayScrollbars } from 'overlayscrollbars';

vi.mock('overlayscrollbars', () => {
	const instances = new WeakMap<
		HTMLElement,
		{
			destroy: ReturnType<typeof vi.fn>;
			update: ReturnType<typeof vi.fn>;
		}
	>();

	return {
		OverlayScrollbars: vi.fn(
			(target: HTMLElement | { target: HTMLElement }, options?: unknown) => {
				const element = target instanceof HTMLElement ? target : target.target;

				if (options === undefined) {
					return instances.get(element) ?? null;
				}

				const instance = {
					destroy: vi.fn(() => {
						instances.delete(element);
					}),
					update: vi.fn(),
				};
				instances.set(element, instance);

				return instance;
			}
		),
	};
});

function TestComponent() {
	useOverlayScrollbars();

	return (
		<div data-os-scroll data-testid="scroll-root">
			<div>content</div>
		</div>
	);
}

afterEach(() => {
	cleanup();
	vi.clearAllMocks();
});

describe('useOverlayScrollbars', () => {
	it('initializes OverlayScrollbars on data-os-scroll elements', async () => {
		render(<TestComponent />);

		await waitFor(() => {
			const initCalls = vi
				.mocked(OverlayScrollbars)
				.mock.calls.filter(([, options]) => options !== undefined);
			expect(initCalls).toHaveLength(1);
		});

		const [target] = vi
			.mocked(OverlayScrollbars)
			.mock.calls.find(([, callOptions]) => callOptions !== undefined)!;

		// The first argument is the element itself (not a target/elements object).
		// OverlayScrollbars wraps it internally with host → padding → viewport.
		expect(target).toBeInstanceOf(HTMLElement);
	});

	it('configures the madora theme and auto-hide', async () => {
		render(<TestComponent />);

		await waitFor(() => {
			const initCalls = vi
				.mocked(OverlayScrollbars)
				.mock.calls.filter(([, options]) => options !== undefined);
			expect(initCalls).toHaveLength(1);
		});

		const [, options] = vi
			.mocked(OverlayScrollbars)
			.mock.calls.find(([, callOptions]) => callOptions !== undefined)!;

		expect(options).toMatchObject({
			scrollbars: {
				theme: 'os-theme-madora',
				autoHide: 'leave',
			},
		});
	});
});
