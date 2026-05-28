import { act, cleanup, render, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { ToastProvider, showErrorToast } from '@/components/ui/toast';

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

		act(() => {
			showErrorToast('普通错误', '默认错误说明');
			showErrorToast('AI 补全失败', 'stack trace', {
				descriptionStyle: 'code',
			});
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

		expect(codeBlocks[0]).toHaveTextContent('stack trace');
		expect(normalDescriptions[0]).toHaveTextContent('默认错误说明');
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
