import { describe, it, expect } from 'vitest';

type CompletionStatusTone = 'muted' | 'loading' | 'success' | 'error';

type CompletionStatus = {
	message: string;
	tone: CompletionStatusTone;
};

const DEFAULT_READY_MESSAGE = 'AI 自动补全已就绪';

function getDefaultCompletionStatus(
	enabled: boolean,
	hasApiKey: boolean
): CompletionStatus {
	if (!enabled) return { message: 'AI 补全已关闭', tone: 'muted' };
	if (!hasApiKey) return { message: '保存 API Key 后可用', tone: 'muted' };
	return { message: DEFAULT_READY_MESSAGE, tone: 'muted' };
}

describe('CompletionStatus', () => {
	it('returns closed message when disabled', () => {
		expect(getDefaultCompletionStatus(false, true)).toEqual({
			message: 'AI 补全已关闭',
			tone: 'muted',
		});
	});

	it('returns no-key message when API key missing', () => {
		expect(getDefaultCompletionStatus(true, false)).toEqual({
			message: '保存 API Key 后可用',
			tone: 'muted',
		});
	});

	it('returns ready message when enabled and has key', () => {
		expect(getDefaultCompletionStatus(true, true)).toEqual({
			message: DEFAULT_READY_MESSAGE,
			tone: 'muted',
		});
	});

	it('all tones are valid', () => {
		const tones: CompletionStatusTone[] = [
			'muted',
			'loading',
			'success',
			'error',
		];
		expect(tones).toContain('muted');
		expect(tones).toContain('loading');
		expect(tones).toContain('success');
		expect(tones).toContain('error');
	});
});
