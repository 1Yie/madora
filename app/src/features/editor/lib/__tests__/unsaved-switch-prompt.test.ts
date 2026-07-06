import { describe, expect, test } from 'bun:test';

import { shouldPromptUnsavedAction } from '../unsaved-switch-prompt';

describe('shouldPromptUnsavedAction', () => {
	test('does not prompt in auto save mode', () => {
		expect(
			shouldPromptUnsavedAction({
				activeDocumentDirty: true,
				hasUnsavedDocuments: true,
				intent: 'switch',
				saveMode: 'auto',
				switchPromptAcknowledged: false,
			})
		).toBe(false);
	});

	test('prompts once when switching away from a dirty active document', () => {
		expect(
			shouldPromptUnsavedAction({
				activeDocumentDirty: true,
				hasUnsavedDocuments: true,
				intent: 'switch',
				saveMode: 'manual',
				switchPromptAcknowledged: false,
			})
		).toBe(true);

		expect(
			shouldPromptUnsavedAction({
				activeDocumentDirty: true,
				hasUnsavedDocuments: true,
				intent: 'switch',
				saveMode: 'manual',
				switchPromptAcknowledged: true,
			})
		).toBe(false);
	});

	test('does not prompt on switch when only another document is dirty', () => {
		expect(
			shouldPromptUnsavedAction({
				activeDocumentDirty: false,
				hasUnsavedDocuments: true,
				intent: 'switch',
				saveMode: 'manual',
				switchPromptAcknowledged: false,
			})
		).toBe(false);
	});

	test('prompts again after returning to workspace resets acknowledgement', () => {
		const dirtySwitch = {
			activeDocumentDirty: true,
			hasUnsavedDocuments: true,
			intent: 'switch' as const,
			saveMode: 'manual' as const,
		};

		expect(
			shouldPromptUnsavedAction({
				...dirtySwitch,
				switchPromptAcknowledged: true,
			})
		).toBe(false);

		expect(
			shouldPromptUnsavedAction({
				...dirtySwitch,
				switchPromptAcknowledged: false,
			})
		).toBe(true);
	});

	test('leave prompt still considers dirty documents across the workspace', () => {
		expect(
			shouldPromptUnsavedAction({
				activeDocumentDirty: false,
				hasUnsavedDocuments: true,
				intent: 'leave',
				saveMode: 'manual',
				switchPromptAcknowledged: true,
			})
		).toBe(true);
	});
});
