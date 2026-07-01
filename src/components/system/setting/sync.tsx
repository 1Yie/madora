import { Cloud, GitBranch } from 'lucide-react';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { MadoraSyncSettings } from '@/components/system/setting/madora-sync';
import { Switch } from '@/components/ui/switch';
import {
	SettingsSectionCard,
	Option,
	SettingRow,
} from '@/components/system/setting/shared';
import { useWorkspace } from '@/context/workspace-provider';

export function SyncSettings() {
	const { t } = useTranslation();
	const { syncEnabled, setSyncEnabled, syncMode, setSyncMode } = useWorkspace();

	const syncModeOptions = useMemo(
		() => [
			{
				id: 'git' as const,
				label: t('settings.sync.options.git.label'),
				description: t('settings.sync.options.git.description'),
				icon: GitBranch,
			},
			{
				id: 'webdav' as const,
				label: t('settings.sync.options.webdav.label'),
				description: t('settings.sync.options.webdav.description'),
				icon: Cloud,
			},
		],
		[t]
	);

	return (
		<div className="space-y-4">
			<SettingsSectionCard title={t('settings.sync.cards.mode.title')}>
				<div className="space-y-4">
					<SettingRow
						title={t('settings.sync.rows.enabled.title')}
						description={t('settings.sync.rows.enabled.description')}
					>
						<Switch
							checked={syncEnabled}
							onCheckedChange={(checked) => setSyncEnabled(checked)}
						/>
					</SettingRow>
					{syncEnabled && (
						<div className="grid gap-2 sm:grid-cols-2">
							{syncModeOptions.map((option) => (
								<Option
									key={option.id}
									active={syncMode === option.id}
									description={option.description}
									icon={<option.icon className="size-4" />}
									label={option.label}
									onClick={() => setSyncMode(option.id)}
								/>
							))}
						</div>
					)}
				</div>
			</SettingsSectionCard>
			<MadoraSyncSettings />
		</div>
	);
}
