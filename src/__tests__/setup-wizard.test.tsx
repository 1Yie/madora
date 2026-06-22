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
		google: () => <span data-testid="provider-icon">G</span>,
		kimi: () => <span data-testid="provider-icon">K</span>,
		minimax: () => <span data-testid="provider-icon">M</span>,
		'minimax-coding': () => <span data-testid="provider-icon">MC</span>,
		mimo: () => <span data-testid="provider-icon">Mi</span>,
		'mimo-coding': () => <span data-testid="provider-icon">Mc</span>,
		openai: () => <span data-testid="provider-icon">O</span>,
		'opencode-go': () => <span data-testid="provider-icon">OG</span>,
		'opencode-zen': () => <span data-testid="provider-icon">OZ</span>,
		zhipu: () => <span data-testid="provider-icon">Z</span>,
		'zhipu-coding': () => <span data-testid="provider-icon">ZC</span>,
	},
}));
vi.mock('@/context/license-provider', () => {
	const MockLicenseProvider = ({ children }: { children: React.ReactNode }) => (
		<>{children}</>
	);
	return {
		LicenseProvider: MockLicenseProvider,
		useLicense: () => ({
			status: { state: 'active' },
			isLoading: false,
			activate: vi.fn(),
			deactivate: vi.fn(),
			refresh: vi.fn(),
		}),
	};
});

import { AiSettingsProvider } from '@/context/ai-settings-provider';
import {
	AppSettingsProvider,
	useAppSettingsStore,
} from '@/context/app-settings-provider';
import {
	SetupWizard,
	shouldShowSetupWizard,
} from '@/components/system/setup-wizard';

const invokeMock = vi.mocked(invoke);

function renderWizard(onComplete = vi.fn()) {
	return render(
		<AppSettingsProvider>
			<AiSettingsProvider>
				<SetupWizard onComplete={onComplete} />
			</AiSettingsProvider>
		</AppSettingsProvider>
	);
}

describe('SetupWizard', () => {
	beforeEach(() => {
		window.localStorage.clear();
		window.localStorage.setItem('madora-app-locale', 'zh-CN');
		useAppSettingsStore.setState({ localePreference: 'zh-CN' });
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

		expect(screen.getByText('欢迎使用 Madora')).toBeInTheDocument();
		expect(screen.getByAltText('Madora')).toBeInTheDocument();
	});

	it('completes the onboarding flow and persists completion', async () => {
		const user = userEvent.setup();
		const onComplete = vi.fn();
		renderWizard(onComplete);

		// Step 1: Welcome → 开始配置
		await user.click(await screen.findByRole('button', { name: '开始配置' }));

		// Step 2: Configure provider
		expect(screen.getByText('连接提供商')).toBeInTheDocument();

		// Fill API Key using placeholder since Input has no label association
		const apiKeyInput = screen.getByPlaceholderText('sk-...');
		await user.type(apiKeyInput, 'sk-test');

		// Continue to test
		await user.click(screen.getByRole('button', { name: '继续' }));

		// Step 3: Test completes against mock
		await waitFor(() => {
			expect(screen.getByText('你好，欢迎使用 Madora。')).toBeInTheDocument();
		});

		await user.click(screen.getByRole('button', { name: '完成验证' }));

		// Step 4: License — skip trial
		await user.click(screen.getByRole('button', { name: '先试用' }));

		// Step 5: Success
		expect(screen.getByText('一切就绪')).toBeInTheDocument();
		await user.click(screen.getByRole('button', { name: /进入编辑器/ }));

		expect(onComplete).toHaveBeenCalledTimes(1);
		expect(window.localStorage.getItem('madora-setup-complete')).toBe('true');
	});

	it('treats an empty completion response as a successful connection test', async () => {
		const user = userEvent.setup();
		invokeMock.mockImplementation(async (command) => {
			switch (String(command)) {
				case 'has_ai_api_key':
					return false;
				case 'store_ai_api_key':
					return undefined;
				case 'generate_completion_stream':
					return undefined;
				default:
					return undefined;
			}
		});

		renderWizard();

		await user.click(await screen.findByRole('button', { name: '开始配置' }));
		await user.type(screen.getByPlaceholderText('sk-...'), 'sk-test');
		await user.click(screen.getByRole('button', { name: '继续' }));

		await waitFor(() => {
			expect(
				screen.getByText(
					'连接成功。模型已正常响应，这次测试没有返回可显示的补全文本。'
				)
			).toBeInTheDocument();
			expect(screen.getByRole('button', { name: '完成验证' })).toBeEnabled();
		});
	});
});
