import { describe, it, expect } from 'vitest';

// Replicate the utility function implementations from use-editor.tsx for testing.

type CompletionSnapshot = {
	cursor: number;
	docText: string;
};

type CompletionStatus = {
	message: string;
	tone: 'muted' | 'loading' | 'success' | 'error';
};

// isSameCompletionSnapshot — from use-editor.tsx:122
function isSameCompletionSnapshot(
	left: CompletionSnapshot | null,
	right: CompletionSnapshot | null
): boolean {
	return left?.cursor === right?.cursor && left?.docText === right?.docText;
}

// shouldTriggerCompletion — from use-editor.tsx:452
function shouldTriggerCompletion(
	enabled: boolean,
	hasApiKey: boolean,
	hasSingleCursor: boolean,
	cursorIsEmpty: boolean,
	promptTrimmed: boolean
): boolean {
	if (!enabled || !hasApiKey) return false;
	if (!hasSingleCursor || !cursorIsEmpty) return false;
	return promptTrimmed;
}

// shouldShowCompletionTooltip — from use-editor.tsx:468
function shouldShowCompletionTooltip(
	hasFocus: boolean,
	hasPendingRequest: boolean,
	tone: CompletionStatus['tone']
): boolean {
	return hasFocus && (hasPendingRequest || tone === 'loading');
}

// getDefaultCompletionStatus — from use-editor.tsx:443
function getDefaultCompletionStatus(
	enabled: boolean,
	hasApiKey: boolean
): CompletionStatus {
	if (!enabled) return { message: 'AI 补全已关闭', tone: 'muted' };
	if (!hasApiKey) return { message: '保存 API Key 后可用', tone: 'muted' };
	return { message: 'AI 自动补全已就绪', tone: 'muted' };
}

describe('isSameCompletionSnapshot', () => {
	it('returns true when both are null', () => {
		expect(isSameCompletionSnapshot(null, null)).toBe(true);
	});

	it('returns false when one is null', () => {
		const snap: CompletionSnapshot = { cursor: 5, docText: 'hello' };
		expect(isSameCompletionSnapshot(snap, null)).toBe(false);
		expect(isSameCompletionSnapshot(null, snap)).toBe(false);
	});

	it('returns true for identical snapshots', () => {
		const a: CompletionSnapshot = { cursor: 10, docText: 'hello world' };
		const b: CompletionSnapshot = { cursor: 10, docText: 'hello world' };
		expect(isSameCompletionSnapshot(a, b)).toBe(true);
	});

	it('returns false for different cursor', () => {
		const a: CompletionSnapshot = { cursor: 5, docText: 'hello' };
		const b: CompletionSnapshot = { cursor: 10, docText: 'hello' };
		expect(isSameCompletionSnapshot(a, b)).toBe(false);
	});

	it('returns false for different doc text', () => {
		const a: CompletionSnapshot = { cursor: 5, docText: 'hello' };
		const b: CompletionSnapshot = { cursor: 5, docText: 'world' };
		expect(isSameCompletionSnapshot(a, b)).toBe(false);
	});
});

describe('shouldTriggerCompletion', () => {
	it('returns false when disabled', () => {
		expect(shouldTriggerCompletion(false, true, true, true, true)).toBe(false);
	});

	it('returns false without api key', () => {
		expect(shouldTriggerCompletion(true, false, true, true, true)).toBe(false);
	});

	it('returns false without single cursor', () => {
		expect(shouldTriggerCompletion(true, true, false, true, true)).toBe(false);
	});

	it('returns false without empty cursor', () => {
		expect(shouldTriggerCompletion(true, true, true, false, true)).toBe(false);
	});

	it('returns false when prompt is empty', () => {
		expect(shouldTriggerCompletion(true, true, true, true, false)).toBe(false);
	});

	it('returns true when all conditions met', () => {
		expect(shouldTriggerCompletion(true, true, true, true, true)).toBe(true);
	});
});

describe('shouldShowCompletionTooltip', () => {
	it('returns false when view does not have focus', () => {
		expect(shouldShowCompletionTooltip(false, false, 'loading')).toBe(false);
	});

	it('returns true with focus and loading tone', () => {
		expect(shouldShowCompletionTooltip(true, false, 'loading')).toBe(true);
	});

	it('returns true with focus and pending request', () => {
		expect(shouldShowCompletionTooltip(true, true, 'muted')).toBe(true);
	});

	it('returns false with focus and no pending request, muted tone', () => {
		expect(shouldShowCompletionTooltip(true, false, 'muted')).toBe(false);
	});

	it('returns false with focus and no pending request, success tone', () => {
		expect(shouldShowCompletionTooltip(true, false, 'success')).toBe(false);
	});

	it('returns false with focus and no pending request, error tone', () => {
		expect(shouldShowCompletionTooltip(true, false, 'error')).toBe(false);
	});
});

describe('getDefaultCompletionStatus', () => {
	it('shows closed message when disabled', () => {
		const status = getDefaultCompletionStatus(false, true);
		expect(status.message).toBe('AI 补全已关闭');
		expect(status.tone).toBe('muted');
	});

	it('shows no key message when missing', () => {
		const status = getDefaultCompletionStatus(true, false);
		expect(status.message).toBe('保存 API Key 后可用');
		expect(status.tone).toBe('muted');
	});

	it('shows ready message when enabled and has key', () => {
		const status = getDefaultCompletionStatus(true, true);
		expect(status.message).toBe('AI 自动补全已就绪');
		expect(status.tone).toBe('muted');
	});
});
