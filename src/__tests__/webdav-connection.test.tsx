import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { WebDavTabConnection } from '@/components/explorer/webdav/tab/connection';
import type { WebDavConfig } from '@/invoke/webdav';

afterEach(() => {
	cleanup();
	vi.clearAllMocks();
});

function baseConfig(hasPassword: boolean): WebDavConfig {
	return {
		url: 'https://dav.example.com/',
		username: 'user',
		conflict_strategy: 'local_first',
		remote_subdir: null,
		local_subdir: null,
		last_sync_at: null,
		has_password: hasPassword,
	};
}

const noop = () => {};

describe('WebDavTabConnection password field', () => {
	it('shows a masked placeholder without pre-filling the stored password', () => {
		const { container } = render(
			<WebDavTabConnection
				config={baseConfig(true)}
				password=""
				testing={false}
				saving={false}
				onConfigChange={noop}
				onPasswordChange={noop}
				onTestConnection={noop}
				onSaveConfig={noop}
				onDeleteConfig={noop}
			/>
		);

		const input = container.querySelector(
			'input[type="password"]'
		) as HTMLInputElement;
		expect(input).toBeTruthy();
		expect(input.value).toBe('');
		expect(input.placeholder).toBe('••••••••');
	});

	it('leaves the placeholder empty when no password is stored', () => {
		const { container } = render(
			<WebDavTabConnection
				config={baseConfig(false)}
				password=""
				testing={false}
				saving={false}
				onConfigChange={noop}
				onPasswordChange={noop}
				onTestConnection={noop}
				onSaveConfig={noop}
				onDeleteConfig={noop}
			/>
		);

		const input = container.querySelector(
			'input[type="password"]'
		) as HTMLInputElement;
		expect(input.placeholder).toBe('');
	});
});
