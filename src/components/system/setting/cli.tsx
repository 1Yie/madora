import { useEffect, useState } from 'react';
import { Switch } from '@/components/ui/switch';
import { showErrorToast, showSuccessToast } from '@/components/ui/toast';
import {
	SettingRow,
	SettingsSectionCard,
	Stat,
} from '@/components/system/setting/shared';
import {
	getCliStatus,
	installCli,
	uninstallCli,
	type CliStatus,
} from '@/invoke/system';

export function CliSettings() {
	const [status, setStatus] = useState<CliStatus | null>(null);
	const [loading, setLoading] = useState(false);

	const symlinked = status?.symlink_ok ?? false;
	const binaryReady = status?.available || status?.binary_path != null;

	useEffect(() => {
		getCliStatus()
			.then(setStatus)
			.catch((e) => showErrorToast(`获取 CLI 状态失败: ${e}`));
	}, []);

	const refreshStatus = () => {
		getCliStatus()
			.then(setStatus)
			.catch((e) => showErrorToast(`获取 CLI 状态失败: ${e}`));
	};

	const handleToggle = async (enabled: boolean) => {
		setLoading(true);
		try {
			if (enabled) {
				await installCli();
				showSuccessToast('CLI symlink 已安装');
			} else {
				await uninstallCli();
				showSuccessToast('CLI symlink 已移除');
			}
			refreshStatus();
		} catch (e: unknown) {
			showErrorToast(
				enabled ? `安装 symlink 失败: ${e}` : `移除 symlink 失败: ${e}`
			);
		} finally {
			setLoading(false);
		}
	};

	return (
		<div className="space-y-4">
			<SettingsSectionCard title="CLI">
				<div className="space-y-2">
					<SettingRow
						title="启用 CLI"
						description="开启后可在终端中使用 mado 命令操作当前项目。"
					>
						<Switch
							checked={symlinked}
							disabled={loading || (!symlinked && !binaryReady)}
							onCheckedChange={handleToggle}
						/>
					</SettingRow>
				</div>
			</SettingsSectionCard>

			<SettingsSectionCard title="运行状态">
				<div className="grid gap-3 sm:grid-cols-2">
					<Stat
						label="CLI 二进制"
						value={
							status?.binary_path
								? status.binary_path
										.split('/')
										.filter(Boolean)
										.slice(-2)
										.join('/')
								: binaryReady
									? '可用'
									: '未找到'
						}
					/>
					<Stat label="终端命令" value={symlinked ? 'mado' : '不可用'} />
				</div>
			</SettingsSectionCard>
		</div>
	);
}
