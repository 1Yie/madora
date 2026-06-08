import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
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

const CLI_ENABLED_KEY = 'madora-cli-enabled';

export function CliSettings() {
	const [cliEnabled, setCliEnabled] = useState(() => {
		return window.localStorage.getItem(CLI_ENABLED_KEY) === 'true';
	});
	const [status, setStatus] = useState<CliStatus | null>(null);
	const [loading, setLoading] = useState(false);

	const ready = status?.in_path || status?.symlink_ok;
	const found = status?.available || status?.binary_path != null;

	const refreshStatus = async () => {
		try {
			setStatus(await getCliStatus());
		} catch (e) {
			showErrorToast(`获取 CLI 状态失败: ${e}`);
		}
	};

	useEffect(() => {
		getCliStatus()
			.then(setStatus)
			.catch((e) => showErrorToast(`获取 CLI 状态失败: ${e}`));
	}, []);

	const handleToggle = (enabled: boolean) => {
		setCliEnabled(enabled);
		window.localStorage.setItem(CLI_ENABLED_KEY, String(enabled));
	};

	const installSymlink = async () => {
		setLoading(true);
		try {
			await installCli();
			showSuccessToast('CLI symlink 已安装');
			await refreshStatus();
		} catch (e: unknown) {
			showErrorToast(`安装失败: ${e}`);
		} finally {
			setLoading(false);
		}
	};

	const uninstallSymlink = async () => {
		setLoading(true);
		try {
			await uninstallCli();
			setCliEnabled(false);
			window.localStorage.setItem(CLI_ENABLED_KEY, 'false');
			showSuccessToast('CLI symlink 已移除');
			await refreshStatus();
		} catch (e: unknown) {
			showErrorToast(`卸载失败: ${e}`);
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
							checked={cliEnabled}
							disabled={!cliEnabled && !ready}
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
								: found
									? '可用'
									: '未找到'
						}
					/>
					<Stat label="终端命令" value={ready ? 'mado' : '不可用'} />
				</div>

				<div className="mt-4 flex flex-wrap gap-2">
					<Button
						size="sm"
						variant="secondary"
						disabled={loading}
						onClick={refreshStatus}
					>
						刷新状态
					</Button>

					{status?.symlink_ok ? (
						<Button
							size="sm"
							variant="outline"
							disabled={loading}
							onClick={uninstallSymlink}
						>
							移除 Symlink
						</Button>
					) : (
						found && (
							<Button
								size="sm"
								variant="default"
								disabled={loading}
								onClick={installSymlink}
							>
								安装 Symlink
							</Button>
						)
					)}
				</div>
			</SettingsSectionCard>
		</div>
	);
}
