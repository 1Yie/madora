import { EditorSelection } from '@codemirror/state';
import type { EditorView } from '@codemirror/view';
import { act, render, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { MutableRefObject } from 'react';

import { useEditor } from '@/hooks/use-editor';

const mocks = vi.hoisted(() => ({
	aiSettings: {
		apiUrl: '',
		customProtocol: 'openai',
		enabled: true,
		hasApiKey: true,
		model: '',
		provider: 'deepseek',
		useSsl: true,
	},
	cancelCompletionStream: vi.fn(),
	streamCompletion: vi.fn(),
}));

vi.mock('@/context/ai-settings-provider', () => ({
	useAiSettings: () => mocks.aiSettings,
}));

vi.mock('@/invoke/ai', () => ({
	cancelCompletionStream: mocks.cancelCompletionStream,
	streamCompletion: mocks.streamCompletion,
}));

vi.mock('@/context/theme-provider', () => ({
	useTheme: () => ({ resolvedTheme: 'light' }),
}));

vi.mock('@/components/ui/math-curve-loader', () => ({
	MathCurveLoader: () => <div />,
}));

vi.mock('@/components/ui/toast', () => ({
	showErrorToast: vi.fn(),
}));

type EditorHarnessProps = {
	onChange: (value: string) => void;
	viewRef: MutableRefObject<EditorView | null>;
	value: string;
};

function EditorHarness({ onChange, viewRef, value }: EditorHarnessProps) {
	const { editorRef } = useEditor({ onChange, value, viewRef });
	return <div ref={editorRef} />;
}

afterEach(() => {
	mocks.streamCompletion.mockReset();
	mocks.cancelCompletionStream.mockReset();
	mocks.cancelCompletionStream.mockResolvedValue(undefined);
});

describe('completion cancellation', () => {
	it('cancels the previous backend stream when a new completion supersedes it', async () => {
		let firstRequestId: string | undefined;
		let resolveFirst: (() => void) | undefined;
		mocks.streamCompletion.mockImplementationOnce(
			(opts: { requestId?: string }) => {
				firstRequestId = opts.requestId;
				return new Promise<string | null>((resolve) => {
					resolveFirst = () => resolve(null);
				});
			}
		);
		mocks.streamCompletion.mockResolvedValue(null);

		const onChange = vi.fn();
		const viewRef = { current: null } as MutableRefObject<EditorView | null>;
		render(<EditorHarness onChange={onChange} viewRef={viewRef} value="" />);

		await waitFor(() => {
			expect(viewRef.current).not.toBeNull();
		});

		const view = viewRef.current;
		if (!view) {
			throw new Error('EditorView was not initialized');
		}

		act(() => {
			view.focus();
			view.dispatch({
				changes: { from: 0, insert: '你' },
				selection: EditorSelection.cursor(1),
			});
		});

		await waitFor(() => {
			expect(mocks.streamCompletion).toHaveBeenCalledTimes(1);
		});

		act(() => {
			view.dispatch({
				changes: { from: 1, insert: '好' },
				selection: EditorSelection.cursor(2),
			});
		});

		await waitFor(() => {
			expect(mocks.cancelCompletionStream).toHaveBeenCalledWith(firstRequestId);
		});

		act(() => {
			resolveFirst?.();
		});
	});

	async function typeAndWaitForRequest() {
		const onChange = vi.fn();
		const viewRef = { current: null } as MutableRefObject<EditorView | null>;
		const { container } = render(
			<EditorHarness onChange={onChange} viewRef={viewRef} value="" />
		);

		await waitFor(() => {
			expect(viewRef.current).not.toBeNull();
		});

		const view = viewRef.current;
		if (!view) {
			throw new Error('EditorView was not initialized');
		}

		act(() => {
			view.focus();
			view.dispatch({
				changes: { from: 0, insert: '你' },
				selection: EditorSelection.cursor(1),
			});
		});

		await waitFor(() => {
			expect(mocks.streamCompletion).toHaveBeenCalledTimes(1);
		});

		return container;
	}

	it("shows the backend's final text instead of the raw streamed chunks", async () => {
		mocks.streamCompletion.mockImplementation(
			async ({ onChunk }: { onChunk: (chunk: string) => void }) => {
				onChunk('```\n');
				onChunk('清理后的建议');
				onChunk('\n```');
				return '清理后的建议';
			}
		);

		const container = await typeAndWaitForRequest();

		await waitFor(() => {
			expect(container.querySelector('.cm-fim-preview')).toHaveTextContent(
				'清理后的建议'
			);
		});
		expect(
			container.querySelector('.cm-fim-preview')?.textContent
		).not.toContain('```');
	});

	it('drops the preview when the backend decides the completion is empty', async () => {
		mocks.streamCompletion.mockImplementation(
			async ({ onChunk }: { onChunk: (chunk: string) => void }) => {
				onChunk('   ');
				return '';
			}
		);

		const container = await typeAndWaitForRequest();

		await waitFor(() => {
			expect(mocks.streamCompletion).toHaveBeenCalled();
		});
		await act(async () => {
			await Promise.resolve();
		});
		expect(container.querySelector('.cm-fim-preview')).toBeNull();
	});

	it('drops the preview when the backend reports the request was cancelled', async () => {
		mocks.streamCompletion.mockImplementation(
			async ({ onChunk }: { onChunk: (chunk: string) => void }) => {
				onChunk('partial');
				return null;
			}
		);

		const container = await typeAndWaitForRequest();

		await act(async () => {
			await Promise.resolve();
		});
		await waitFor(() => {
			expect(container.querySelector('.cm-fim-preview')).toBeNull();
		});
	});
});
