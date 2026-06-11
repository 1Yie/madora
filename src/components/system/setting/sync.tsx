import { Cloud, GitBranch } from 'lucide-react';
import { useMemo } from 'react';
import { Switch } from '@/components/ui/switch';
import {
	SettingsSectionCard,
	Option,
	SettingRow,
} from '@/components/system/setting/shared';
import { useWorkspace } from '@/context/workspace-provider';

export function SyncSettings() {
	const { syncEnabled, setSyncEnabled, syncMode, setSyncMode } = useWorkspace();

	const syncModeOptions = useMemo(
		() => [
			{
				id: 'git' as const,
				label: 'Git',
				description: '本地版本控制，支持提交、推送、拉取与分支管理',
				icon: GitBranch,
			},
			{
				id: 'webdav' as const,
				label: 'WebDAV',
				description: '远端文件同步，通过 WebDAV 协议同步文件',
				icon: Cloud,
			},
		],
		[]
	);

	return (
		<div className="space-y-4">
			<SettingsSectionCard title="同步方案">
				<div className="space-y-4">
					<SettingRow title="启用同步">
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
		</div>
	);
}
