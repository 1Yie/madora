import { EditorSelection } from '@codemirror/state';
import type { EditorView } from '@codemirror/view';
import { act, render, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import type { MutableRefObject } from 'react';

import { useEditor } from '@/hooks/use-editor';

vi.mock('@/context/ai-settings-provider', () => ({
	useAiSettings: () => ({
		apiUrl: '',
		customProtocol: 'openai',
		enabled: false,
		hasApiKey: false,
		model: '',
		provider: 'deepseek',
	}),
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
	vi.clearAllMocks();
});

describe('MarkdownEditor', () => {
	it('keeps the latest local text and cursor when a stale controlled value rerenders', async () => {
		const onChange = vi.fn();
		const viewRef = { current: null } as MutableRefObject<EditorView | null>;
		const { rerender } = render(
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
			view.dispatch({
				changes: { from: 0, insert: 'a' },
				selection: EditorSelection.cursor(1),
			});
			view.dispatch({
				changes: { from: 1, insert: 'b' },
				selection: EditorSelection.cursor(2),
			});
		});

		expect(onChange).toHaveBeenNthCalledWith(1, 'a');
		expect(onChange).toHaveBeenNthCalledWith(2, 'ab');
		expect(view.state.doc.toString()).toBe('ab');
		expect(view.state.selection.main.head).toBe(2);

		rerender(<EditorHarness onChange={onChange} viewRef={viewRef} value="a" />);

		await waitFor(() => {
			expect(view.state.doc.toString()).toBe('ab');
			expect(view.state.selection.main.head).toBe(2);
		});

		rerender(
			<EditorHarness onChange={onChange} viewRef={viewRef} value="ab" />
		);

		await waitFor(() => {
			expect(view.state.doc.toString()).toBe('ab');
			expect(view.state.selection.main.head).toBe(2);
		});
	});
});
