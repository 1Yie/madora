import { invoke } from '@tauri-apps/api/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('@/components/ui/toast', () => ({
	showErrorToast: vi.fn(),
	showSuccessToast: vi.fn(),
}));

vi.mock('@/components/ui/provider-icons', () => ({
	providerIconMap: {
		anthropic: () => <span data-testid="provider-icon">A</span>,
		custom: () => <span data-testid="provider-icon">C</span>,
		deepseek: () => <span data-testid="provider-icon">D</span>,
		kimi: () => <span data-testid="provider-icon">K</span>,
		minimax: () => <span data-testid="provider-icon">M</span>,
		mimo: () => <span data-testid="provider-icon">Mi</span>,
		'mimo-coding': () => <span data-testid="provider-icon">Mc</span>,
		openai: () => <span data-testid="provider-icon">O</span>,
	},
}));

import { AiSettingsProvider } from '@/components/system/ai-settings-provider';
import {
	SetupWizard,
	shouldShowSetupWizard,
} from '@/components/system/setup-wizard';

const invokeMock = vi.mocked(invoke);

function renderWizard(onComplete = vi.fn()) {
	return render(
		<AiSettingsProvider>
			<SetupWizard onComplete={onComplete} />
		</AiSettingsProvider>
	);
}

describe('SetupWizard', () => {
	beforeEach(() => {
		window.localStorage.clear();
		invokeMock.mockReset();
		invokeMock.mockImplementation(async (command, args) => {
			switch (String(command)) {
				case 'has_ai_api_key':
					return false;
				case 'store_ai_api_key':
					return undefined;
				case 'generate_completion_stream': {
					const { channel } = args as {
						channel: { onmessage: (chunk: string) => void };
					};
					channel.onmessage('你好，欢迎使用 Madora。');
					return undefined;
				}
				default:
					return undefined;
			}
		});
	});

	afterEach(() => {
		cleanup();
	});

	it('shows the wizard when setup is incomplete', () => {
		expect(shouldShowSetupWizard()).toBe(true);
		window.localStorage.setItem('madora-setup-complete', 'true');
		expect(shouldShowSetupWizard()).toBe(false);
	});

	it('renders the welcome step with the branded logo', async () => {
		renderWizard();

		expect(
			await screen.findByText('打开 Markdown，AI 会在旁边补全。')
		).toBeInTheDocument();
		expect(screen.getAllByAltText('Madora logo').length).toBeGreaterThan(0);
	});

	it('completes the onboarding flow and persists completion', async () => {
		const user = userEvent.setup();
		const onComplete = vi.fn();
		renderWizard(onComplete);

		await user.click(await screen.findByRole('button', { name: '开始配置' }));

		expect(screen.getByText('AI 补全配置')).toBeInTheDocument();
		await user.type(screen.getByLabelText('API Key'), 'sk-test');
		await user.click(screen.getByRole('button', { name: /开始测试/ }));

		await waitFor(() => {
			expect(screen.getByText('补全测试成功')).toBeInTheDocument();
		});

		await user.click(screen.getByRole('button', { name: /下一步/ }));
		expect(screen.getByText('现在就可以开始写了')).toBeInTheDocument();

		await user.click(screen.getByRole('button', { name: /开始使用 Madora/ }));

		expect(onComplete).toHaveBeenCalledTimes(1);
		expect(window.localStorage.getItem('madora-setup-complete')).toBe('true');
	});
});
