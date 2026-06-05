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
		<div className="overflow-auto" data-testid="scroll-root">
			<div>content</div>
		</div>
	);
}

function DynamicScrollComponent({ locked }: { locked: boolean }) {
	useOverlayScrollbars();

	return (
		<div
			data-os-scroll
			data-testid="dynamic-scroll-root"
			style={{ overflow: locked ? 'hidden' : 'auto' }}
		>
			<div>content</div>
		</div>
	);
}

afterEach(() => {
	cleanup();
	vi.clearAllMocks();
});

describe('useOverlayScrollbars', () => {
	it('initializes OverlayScrollbars with the existing element as viewport', async () => {
		render(<TestComponent />);

		await waitFor(() => {
			const initCalls = vi
				.mocked(OverlayScrollbars)
				.mock.calls.filter(([, options]) => options !== undefined);
			expect(initCalls).toHaveLength(1);
		});

		const [target, options] = vi
			.mocked(OverlayScrollbars)
			.mock.calls.find(([, callOptions]) => callOptions !== undefined)!;

		expect(options).toMatchObject({
			scrollbars: {
				theme: 'os-theme-madora',
				autoHide: 'leave',
			},
		});

		expect(target).toMatchObject({
			target: expect.any(HTMLElement),
			elements: {
				viewport: expect.any(HTMLElement),
				padding: false,
				content: false,
			},
		});

		const typedTarget = target as {
			target: HTMLElement;
			elements: {
				viewport: HTMLElement;
				padding: false;
				content: false;
			};
		};

		expect(typedTarget.elements.viewport).toBe(typedTarget.target);
	});

	it('updates an existing instance when a tracked element changes overflow style', async () => {
		const { getByTestId, rerender } = render(<DynamicScrollComponent locked />);

		await waitFor(() => {
			const initCalls = vi
				.mocked(OverlayScrollbars)
				.mock.calls.filter(([, options]) => options !== undefined);
			expect(initCalls).toHaveLength(1);
		});

		const scrollRoot = getByTestId('dynamic-scroll-root');
		const instance = OverlayScrollbars(
			scrollRoot as HTMLElement
		) as unknown as {
			update: ReturnType<typeof vi.fn>;
		};

		rerender(<DynamicScrollComponent locked={false} />);

		await waitFor(() => {
			expect(instance.update).toHaveBeenCalled();
		});
	});
});
