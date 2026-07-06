import { describe, expect, test } from 'bun:test';

import {
	getInlineCompletionDecision,
	shouldRequestInlineCompletion,
} from '../inline-completion-guard';

describe('inline completion guard', () => {
	test('requests completion only when provider exists and text is non-empty', () => {
		expect(
			shouldRequestInlineCompletion({
				canRequest: false,
				value: 'hello',
			})
		).toBe(false);
		expect(
			shouldRequestInlineCompletion({
				canRequest: true,
				value: '   ',
			})
		).toBe(false);
		expect(
			shouldRequestInlineCompletion({
				canRequest: true,
				value: 'hello',
			})
		).toBe(true);
	});

	test('drops stale completion when another request has started', () => {
		expect(
			getInlineCompletionDecision({
				completion: ' world',
				currentSequence: 2,
				lastLocalValue: 'hello',
				latestCursorIndex: 5,
				requestSequence: 1,
				snapshotCursorIndex: 5,
				snapshotValue: 'hello',
			})
		).toBe('stale');
	});

	test('drops stale completion when editor content changed', () => {
		expect(
			getInlineCompletionDecision({
				completion: ' world',
				currentSequence: 1,
				lastLocalValue: 'hello!',
				latestCursorIndex: 5,
				requestSequence: 1,
				snapshotCursorIndex: 5,
				snapshotValue: 'hello',
			})
		).toBe('stale');
	});

	test('returns cursor-moved when cursor no longer matches snapshot', () => {
		expect(
			getInlineCompletionDecision({
				completion: ' world',
				currentSequence: 1,
				lastLocalValue: 'hello',
				latestCursorIndex: 4,
				requestSequence: 1,
				snapshotCursorIndex: 5,
				snapshotValue: 'hello',
			})
		).toBe('cursor-moved');
	});

	test('shows non-empty completion and idles on empty completion', () => {
		const base = {
			currentSequence: 1,
			lastLocalValue: 'hello',
			latestCursorIndex: 5,
			requestSequence: 1,
			snapshotCursorIndex: 5,
			snapshotValue: 'hello',
		};

		expect(
			getInlineCompletionDecision({
				...base,
				completion: ' world',
			})
		).toBe('show');
		expect(
			getInlineCompletionDecision({
				...base,
				completion: '',
			})
		).toBe('idle');
	});
});
