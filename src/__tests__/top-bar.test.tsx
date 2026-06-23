import '@/i18n';

import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import Titlebar from '@/components/system/top-bar';
import i18n from '@/i18n';

const mockHideWindow = vi.fn();
const mockQuitApp = vi.fn();
const mockOnCloseRequested = vi.fn();
const mockHasUnsaved = vi.fn();
const mockSaveAll = vi.fn();
const mockClearStoredMarkdownDrafts = vi.fn();

const appSettings = {
	closeBehavior: 'minimize' as 'minimize' | 'exit',
};

vi.mock('@/components/system/settings-dialog', () => ({
	SettingsDialog: () => <div data-testid="settings-dialog" />,
}));

vi.mock('@/invoke/window', () => ({
	minimizeWindow: vi.fn(),
	onCloseRequested: (...args: unknown[]) => mockOnCloseRequested(...args),
	toggleMaximizeWindow: vi.fn(),
}));

vi.mock('@/invoke/system', () => ({
	hideWindow: (...args: unknown[]) => mockHideWindow(...args),
	quitApp: (...args: unknown[]) => mockQuitApp(...args),
}));

vi.mock('@/components/ui/toast', () => ({
	showErrorToast: vi.fn(),
}));

vi.mock('@/lib/unsaved-registry', () => ({
	clearStoredMarkdownDrafts: (...args: unknown[]) =>
		mockClearStoredMarkdownDrafts(...args),
	hasUnsaved: (...args: unknown[]) => mockHasUnsaved(...args),
	saveAll: (...args: unknown[]) => mockSaveAll(...args),
}));

vi.mock('@/context/app-settings-provider', () => ({
	useAppSettings: () => appSettings,
}));

function getCloseButton(container: HTMLElement): HTMLButtonElement {
	const closeButton = container.querySelector('button.group');
	if (!(closeButton instanceof HTMLButtonElement)) {
		throw new Error('close button not found');
	}
	return closeButton;
}

describe('Titlebar close flow', () => {
	beforeEach(async () => {
		await i18n.changeLanguage('zh-CN');
		appSettings.closeBehavior = 'minimize';
		mockHideWindow.mockReset();
		mockHideWindow.mockResolvedValue(undefined);
		mockQuitApp.mockReset();
		mockQuitApp.mockResolvedValue(undefined);
		mockOnCloseRequested.mockReset();
		mockOnCloseRequested.mockResolvedValue(vi.fn());
		mockHasUnsaved.mockReset();
		mockHasUnsaved.mockReturnValue(false);
		mockSaveAll.mockReset();
		mockSaveAll.mockResolvedValue([]);
		mockClearStoredMarkdownDrafts.mockReset();
	});

	afterEach(() => {
		cleanup();
	});

	it('asks for confirmation before minimizing with unsaved changes', async () => {
		mockHasUnsaved.mockReturnValue(true);
		const user = userEvent.setup();
		const { container } = render(<Titlebar />);

		await user.click(getCloseButton(container));

		expect(await screen.findByText('当前工作区改动未保存')).toBeInTheDocument();
		expect(screen.getByText('确定要最小化到托盘吗？')).toBeInTheDocument();
		expect(mockHideWindow).not.toHaveBeenCalled();
	});

	it('does not flash exit copy when dismissing the minimize confirmation', async () => {
		mockHasUnsaved.mockReturnValue(true);
		const user = userEvent.setup();
		const { container } = render(<Titlebar />);

		await user.click(getCloseButton(container));
		await user.click(await screen.findByRole('button', { name: '取消' }));

		expect(screen.queryByText('工作区还有文档未保存')).not.toBeInTheDocument();
		expect(
			screen.queryByText(
				'关闭窗口前请选择：先保存修改，或放弃这些未保存的内容。'
			)
		).not.toBeInTheDocument();
		expect(mockHideWindow).not.toHaveBeenCalled();
		expect(mockQuitApp).not.toHaveBeenCalled();
	});

	it('minimizes after explicit confirmation in minimize mode', async () => {
		mockHasUnsaved.mockReturnValue(true);
		const user = userEvent.setup();
		const { container } = render(<Titlebar />);

		await user.click(getCloseButton(container));
		await user.click(await screen.findByRole('button', { name: '仍然最小化' }));

		await waitFor(() => {
			expect(mockHideWindow).toHaveBeenCalledTimes(1);
		});
	});

	it('minimizes immediately when there are no unsaved changes', async () => {
		const user = userEvent.setup();
		const { container } = render(<Titlebar />);

		await user.click(getCloseButton(container));

		await waitFor(() => {
			expect(mockHideWindow).toHaveBeenCalledTimes(1);
		});
		expect(screen.queryByText('当前工作区改动未保存')).not.toBeInTheDocument();
	});

	it('keeps the existing unsaved-close dialog in exit mode', async () => {
		appSettings.closeBehavior = 'exit';
		mockHasUnsaved.mockReturnValue(true);
		const user = userEvent.setup();
		const { container } = render(<Titlebar />);

		await user.click(getCloseButton(container));

		expect(await screen.findByText('工作区还有文档未保存')).toBeInTheDocument();
		expect(
			screen.getByText('关闭窗口前请选择：先保存修改，或放弃这些未保存的内容。')
		).toBeInTheDocument();
		expect(mockHideWindow).not.toHaveBeenCalled();
		expect(mockQuitApp).not.toHaveBeenCalled();
	});
});
