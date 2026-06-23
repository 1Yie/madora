import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
	ToastProvider,
	showErrorToast,
	toastManager,
} from '@/components/ui/toast';

afterEach(() => {
	cleanup();
});

describe('showErrorToast', () => {
	it('uses code-block styling only when explicitly requested', async () => {
		render(
			<ToastProvider>
				<div>toast host</div>
			</ToastProvider>
		);

		// toastManager.close() before add() means only the last toast survives
		act(() => {
			showErrorToast('普通错误', '默认错误说明');
			showErrorToast('AI 补全失败', 'stack trace', {
				descriptionStyle: 'code',
			});
		});

		await waitFor(() => {
			expect(document.body.querySelectorAll('.font-mono')).toHaveLength(1);
			// The code-style toast has its description in .font-mono, not a
			// visible [data-slot="toast-description"] — the prefix is .sr-only.
			expect(
				document.body.querySelectorAll(
					'[data-slot="toast-description"]:not(.sr-only)'
				)
			).toHaveLength(0);
		});

		const codeBlocks = document.body.querySelectorAll('.font-mono');
		expect(codeBlocks[0]).toHaveTextContent('stack trace');
	});
});

it("splits description at ': ' for code-block style, prefix as normal text", async () => {
	render(
		<ToastProvider>
			<div>toast host</div>
		</ToastProvider>
	);

	act(() => {
		showErrorToast(
			'AI 补全失败',
			'OpenAI API error (401): {"error":{"message":"Invalid API key"}}',
			{ descriptionStyle: 'code' }
		);
	});

	await waitFor(() => {
		expect(document.body.querySelectorAll('.font-mono')).toHaveLength(1);
		expect(
			document.body.querySelectorAll(
				'[data-slot="toast-description"]:not(.sr-only)'
			)
		).toHaveLength(1);
	});

	const codeBlocks = document.body.querySelectorAll('.font-mono');
	const normalDescriptions = document.body.querySelectorAll(
		'[data-slot="toast-description"]:not(.sr-only)'
	);

	expect(codeBlocks[0]).toHaveTextContent(
		'{"error":{"message":"Invalid API key"}}'
	);
	expect(normalDescriptions[0]).toHaveTextContent('OpenAI API error (401):');
});

it('wires toast action handlers through the rendered button', async () => {
	const onClick = vi.fn();
	const user = userEvent.setup();

	render(
		<ToastProvider>
			<div>toast host</div>
		</ToastProvider>
	);

	act(() => {
		toastManager.add({
			actionProps: {
				children: 'View Release',
				onClick,
			},
			priority: 'low',
			title: 'New version available',
			type: 'success',
		});
	});

	await user.click(await screen.findByRole('button', { name: 'View Release' }));

	expect(onClick).toHaveBeenCalledTimes(1);
});
