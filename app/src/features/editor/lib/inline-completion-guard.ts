export type InlineCompletionDecision =
	| 'cursor-moved'
	| 'idle'
	| 'show'
	| 'stale';

export function shouldRequestInlineCompletion({
	canRequest,
	value,
}: {
	canRequest: boolean;
	value: string;
}) {
	return canRequest && value.trim().length > 0;
}

export function getInlineCompletionDecision({
	completion,
	currentSequence,
	lastLocalValue,
	latestCursorIndex,
	requestSequence,
	snapshotCursorIndex,
	snapshotValue,
}: {
	completion: string;
	currentSequence: number;
	lastLocalValue: string;
	latestCursorIndex: number;
	requestSequence: number;
	snapshotCursorIndex: number;
	snapshotValue: string;
}): InlineCompletionDecision {
	if (requestSequence !== currentSequence || lastLocalValue !== snapshotValue) {
		return 'stale';
	}

	if (latestCursorIndex !== snapshotCursorIndex) {
		return 'cursor-moved';
	}

	return completion.length > 0 ? 'show' : 'idle';
}
