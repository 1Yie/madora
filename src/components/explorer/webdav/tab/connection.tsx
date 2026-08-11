import {
	Cloud,
	CircleNotch as Loader2,
	FloppyDisk as Save,
	Trash as Trash2,
} from '@phosphor-icons/react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
	FieldBlock,
	SettingsSectionCard,
} from '@/components/system/setting/shared';
import type { WebDavConfig } from '@/invoke/webdav';

type WebDavTabConnectionProps = {
	config: WebDavConfig | null;
	password: string;
	testing: boolean;
	saving: boolean;
	onConfigChange: (config: WebDavConfig | null) => void;
	onPasswordChange: (password: string) => void;
	onTestConnection: () => void;
	onSaveConfig: () => void;
	onDeleteConfig: () => void;
};

export function WebDavTabConnection({
	config,
	password,
	testing,
	saving,
	onConfigChange,
	onPasswordChange,
	onTestConnection,
	onSaveConfig,
	onDeleteConfig,
}: WebDavTabConnectionProps) {
	const { t } = useTranslation();

	return (
		<div className="size-full min-h-0 flex-1 overflow-auto">
			<div className="space-y-6 p-4 sm:p-6">
				<SettingsSectionCard title={t('webdav.connection.cardTitle')}>
					<div className="space-y-3">
						<FieldBlock label={t('webdav.connection.serverUrl')}>
							<Input
								placeholder="https://dav.example.com/remote.php/dav/files/user/"
								value={config?.url ?? ''}
								onChange={(e) =>
									onConfigChange(
										config ? { ...config, url: e.target.value || null } : null
									)
								}
							/>
						</FieldBlock>
						<FieldBlock label={t('webdav.connection.username')}>
							<Input
								placeholder="username"
								value={config?.username ?? ''}
								onChange={(e) =>
									onConfigChange(
										config
											? { ...config, username: e.target.value || null }
											: null
									)
								}
							/>
						</FieldBlock>
						<FieldBlock label={t('webdav.connection.password')}>
							<Input
								type="password"
								placeholder="••••••••"
								value={password}
								onChange={(e) => onPasswordChange(e.target.value)}
							/>
						</FieldBlock>
						<div className="flex items-center gap-2 pt-1">
							<Button
								variant="outline"
								size="sm"
								onClick={onTestConnection}
								disabled={testing || !config?.url}
							>
								{testing ? (
									<Loader2 className="size-3.5 animate-spin" />
								) : (
									<Cloud className="size-3.5" />
								)}
								{testing
									? t('webdav.connection.testing')
									: t('webdav.connection.testAction')}
							</Button>
							<Button
								variant="default"
								size="sm"
								onClick={onSaveConfig}
								loading={saving}
								disabled={!config}
							>
								<Save className="size-3.5" />
								{t('webdav.connection.saveAction')}
							</Button>
							<Button
								variant="destructive"
								size="sm"
								onClick={onDeleteConfig}
								disabled={!config?.url && !config?.username}
							>
								<Trash2 className="size-3.5" />
								{t('webdav.connection.clearAction')}
							</Button>
						</div>
					</div>
				</SettingsSectionCard>
			</div>
		</div>
	);
}
