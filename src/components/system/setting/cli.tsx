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
	type CliInstallResult,
	type CliStatus,
} from '@/invoke/system';

export function CliSettings() {
	const [status, setStatus] = useState<CliStatus | null>(null);
	const [loading, setLoading] = useState(false);

	const installed = status?.installed ?? false;
	useEffect(() => {
		getCliStatus()
			.then(setStatus)
			.catch((e) => showErrorToast(`获取 CLI 状态失败: ${e}`));
	}, []);

	const refreshStatus = async () => {
		try {
			setStatus(await getCliStatus());
		} catch (e) {
			showErrorToast(`获取 CLI 状态失败: ${e}`);
		}
	};

	const handleToggle = async (enabled: boolean) => {
		setLoading(true);
		try {
			if (enabled) {
				const result = await installCli();
				showSuccessToast(buildInstallMessage(result));
			} else {
				const result = await uninstallCli();
				showSuccessToast(
					result.path_updated ? 'CLI 已移除，PATH 设置已清理' : 'CLI 已移除'
				);
			}
			await refreshStatus();
		} catch (e: unknown) {
			showErrorToast(enabled ? `安装 CLI 失败: ${e}` : `移除 CLI 失败: ${e}`);
		} finally {
			setLoading(false);
		}
	};

	const commandStatus = status?.in_path
		? `可直接使用 ${status.command_name}`
		: status?.needs_terminal_restart
			? '请重新打开终端'
			: status?.managed_dir_in_path
				? '安装完成，等待终端刷新'
				: '尚未进入 PATH';

	return (
		<div className="space-y-4">
			<SettingsSectionCard title="CLI">
				<div className="space-y-2">
					<SettingRow
						title="安装 CLI"
						description={
							status?.path_hint ??
							'将 Madora 附带的 mado 命令安装到本机，供终端直接调用。'
						}
					>
						<Switch
							checked={installed}
							disabled={loading}
							onCheckedChange={handleToggle}
						/>
					</SettingRow>
				</div>
			</SettingsSectionCard>

			<SettingsSectionCard title="运行状态">
				<div className="grid gap-3 sm:grid-cols-2">
					<Stat
						label="CLI 来源"
						value={
							status?.source_path
								? formatPathTail(status.source_path)
								: status?.available
									? '可用'
									: '未找到'
						}
					/>
					<Stat label="安装路径" value={status?.install_path ?? '未解析'} />
					<Stat label="终端命令" value={commandStatus ?? '未检测'} />
					<Stat
						label="PATH"
						value={
							status?.managed_dir_in_path ? '已包含安装目录' : '未包含安装目录'
						}
					/>
				</div>
			</SettingsSectionCard>
		</div>
	);
}

function buildInstallMessage(result: CliInstallResult) {
	if (result.path_hint) {
		return `CLI 已安装到 ${result.dest}；${result.path_hint}`;
	}

	if (result.needs_terminal_restart) {
		return 'CLI 已安装，请重新打开终端后使用 mado';
	}

	if (result.path_updated) {
		return 'CLI 已安装，PATH 设置已更新';
	}

	return 'CLI 已安装';
}

function formatPathTail(path: string) {
	return path.split(/[\\/]/).filter(Boolean).slice(-2).join('/');
}
