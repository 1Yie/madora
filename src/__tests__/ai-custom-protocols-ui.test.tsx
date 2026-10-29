import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EditorSettings } from '@/components/system/setting/editor';
import {
	AiSettingsProvider,
	useAiSettingsStore,
} from '@/context/ai-settings-provider';
import { AppSettingsProvider } from '@/context/app-settings-provider';

vi.mock('@/components/ui/toast', () => ({
	showErrorToast: vi.fn(),
	showSuccessToast: vi.fn(),
}));
vi.mock('@/components/ui/provider-icons', () => ({
	providerIconMap: {},
}));

describe('custom protocol settings', () => {
	beforeEach(() => {
		window.localStorage.clear();
		useAiSettingsStore.getState().setProvider('custom');
		useAiSettingsStore.getState().setCustomProtocol('openai');
	});

	afterEach(() => {
		cleanup();
		useAiSettingsStore.getState().setProvider('deepseek');
	});

	it.each([
		['OpenAI Responses', 'openai-responses'],
		['OpenAI Codex (WebSocket)', 'openai-codex'],
	] as const)('selects and stores %s', async (label, protocol) => {
		const user = userEvent.setup();
		render(
			<AppSettingsProvider>
				<AiSettingsProvider>
					<EditorSettings />
				</AiSettingsProvider>
			</AppSettingsProvider>
		);
		const trigger = screen
			.getByText('OpenAI Chat Completions')
			.closest('button');
		expect(trigger).not.toBeNull();
		await user.click(trigger!);
		await user.click(await screen.findByRole('option', { name: label }));

		expect(
			useAiSettingsStore.getState().providerConfigs.custom.customProtocol
		).toBe(protocol);
		expect(
			window.localStorage.getItem('madora-ai-completion-custom-protocol:custom')
		).toBe(protocol);
	});
});
