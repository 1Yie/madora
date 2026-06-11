import {
	Cloud,
	CloudOff,
	Globe,
	Loader2,
	RefreshCw,
	Settings2,
	XIcon,
} from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import {
	webdavDeleteConfig,
	webdavGetConfig,
	webdavSaveConfig,
	webdavSync,
	webdavTestConnection,
	type WebDavConfig,
	type WebDavSyncResult,
} from '@/invoke/webdav';
import { Button } from '@/components/ui/button';
import { Dialog, DialogClose, DialogPopup } from '@/components/ui/dialog';
import { DialogSidebar } from '@/components/ui/dialog-sidebar';
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from '@/components/ui/tooltip';
import { showErrorToast, showSuccessToast } from '@/components/ui/toast';
import { WebDavTabConnection } from './tab/connection';
import { WebDavTabSync } from './tab/sync';

type WebDavWorkbenchTab = 'connection' | 'sync';

const workbenchSections = [
	{
		id: 'connection' as WebDavWorkbenchTab,
		label: '连接',
		description: '服务器与认证配置',
		icon: Globe,
	},
	{
		id: 'sync' as WebDavWorkbenchTab,
		label: '同步',
		description: '同步操作与策略',
		icon: RefreshCw,
	},
];

type WebDavPanelProps = {
	disabled?: boolean;
	workspaceRoot: string | null;
};

export function WebDavPanel({
	disabled = false,
	workspaceRoot,
}: WebDavPanelProps) {
	const [config, setConfig] = useState<WebDavConfig | null>(null);
	const [password, setPassword] = useState('');
	const [workbenchOpen, setWorkbenchOpen] = useState(false);
	const [activeTab, setActiveTab] = useState<WebDavWorkbenchTab>('connection');
	const [testing, setTesting] = useState(false);
	const [syncing, setSyncing] = useState(false);
	const [saving, setSaving] = useState(false);
	const [syncResult, setSyncResult] = useState<WebDavSyncResult | null>(null);

	useEffect(() => {
		webdavGetConfig()
			.then((cfg) => {
				setConfig(cfg);
				setPassword(cfg.password ?? '');
			})
			.catch(() => {
				/* no config yet */
			});
	}, []);

	const canSync = !disabled && !!config?.url && !!workspaceRoot;

	const handleOpenWorkbench = useCallback(() => setWorkbenchOpen(true), []);

	// ── Connection handlers ──

	const handleTestConnection = useCallback(async () => {
		if (!config) return;
		setTesting(true);
		try {
			const result = await webdavTestConnection({
				url: config.url ?? undefined,
				username: config.username ?? undefined,
				password: password || undefined,
			});
			if (result.success) {
				showSuccessToast(
					result.server_name ? `连接成功 — ${result.server_name}` : '连接成功'
				);
			} else {
				showErrorToast('连接失败', result.error ?? '未知错误');
			}
		} catch (err) {
			showErrorToast('测试连接出错', String(err));
		} finally {
			setTesting(false);
		}
	}, [config, password]);

	const handleSaveConfig = useCallback(async () => {
		if (!config) return;
		setSaving(true);
		try {
			await webdavSaveConfig(config, password || undefined);
			showSuccessToast('配置已保存');
		} catch (err) {
			showErrorToast('保存配置失败', String(err));
		} finally {
			setSaving(false);
		}
	}, [config, password]);

	const handleDeleteConfig = useCallback(async () => {
		try {
			await webdavDeleteConfig();
			setConfig(null);
			setPassword('');
			showSuccessToast('配置已清除');
		} catch (err) {
			showErrorToast('清除配置失败', String(err));
		}
	}, []);

	// ── Sync handlers ──

	const handleSync = useCallback(async () => {
		if (!canSync || !workspaceRoot) return;
		setSyncing(true);
		setSyncResult(null);
		try {
			// Persist config changes (conflict strategy, etc.) before syncing
			if (config) {
				await webdavSaveConfig(config);
			}
			const result = await webdavSync(workspaceRoot);
			setSyncResult(result);
			webdavGetConfig()
				.then((cfg) => setConfig(cfg))
				.catch(() => {});
			window.dispatchEvent(new CustomEvent('webdav-sync-complete'));
			if (result.errors.length > 0) {
				showErrorToast('同步完成，有错误', `${result.errors.length} 个错误`);
			} else {
				showSuccessToast(
					`同步完成 — 上传 ${result.files_uploaded}，下载 ${result.files_downloaded}`
				);
			}
		} catch (err) {
			showErrorToast('同步失败', String(err));
		} finally {
			setSyncing(false);
		}
	}, [canSync, workspaceRoot, config, password]);

	// ── Status bar ──

	const statusBar = !config?.url ? (
		<div className="flex w-full items-center gap-2 px-2 py-1">
			<CloudOff className="size-3.5 shrink-0 text-muted-foreground" />
			<span className="flex-1 truncate text-muted-foreground">
				WebDAV 未配置
			</span>
			<Button
				size="icon-xs"
				variant="ghost"
				onClick={handleOpenWorkbench}
				aria-label="配置 WebDAV"
			>
				<Settings2 className="size-3.5" />
			</Button>
		</div>
	) : (
		<div className="flex w-full items-center gap-2 px-2 py-1">
			{syncing ? (
				<Loader2 className="size-3.5 shrink-0 animate-spin text-primary" />
			) : (
				<Cloud className="size-3.5 shrink-0 text-primary" />
			)}
			<div className="flex min-w-0 flex-1 items-center gap-2 overflow-hidden">
				<span
					className="max-w-[45%] shrink truncate font-medium text-foreground"
				>
					WebDAV
				</span>
				<Tooltip>
					<TooltipTrigger
						className="min-w-0 flex-1 truncate text-left text-muted-foreground"
						render={<span />}
					>
						{config.last_sync_at
							? `上次同步: ${new Date(config.last_sync_at).toLocaleString()}`
							: '未同步'}
					</TooltipTrigger>
					{config.last_sync_at && (
						<TooltipContent side="top">
							{new Date(config.last_sync_at).toLocaleString('zh-CN', {
								dateStyle: 'full',
								timeStyle: 'long',
							})}
						</TooltipContent>
					)}
				</Tooltip>
			</div>
			<div className="flex shrink-0 items-center gap-1 text-muted-foreground">
				<Button
					disabled={!canSync || syncing}
					onClick={handleSync}
					size="icon-xs"
					variant="ghost"
					aria-label="同步"
				>
					{syncing ? (
						<Loader2 className="size-3.5 animate-spin" />
					) : (
						<RefreshCw className="size-3.5" />
					)}
				</Button>
				<Button
					onClick={handleOpenWorkbench}
					size="icon-xs"
					variant="ghost"
					aria-label="WebDAV 设置"
				>
					<Settings2 className="size-3.5" />
				</Button>
			</div>
		</div>
	);

	return (
		<>
			{statusBar}

			<Dialog onOpenChange={setWorkbenchOpen} open={workbenchOpen}>
				<DialogPopup
					showCloseButton={false}
					className="max-h-[calc(100vh-3rem)] max-w-[calc(100vw-3rem)]
						overflow-hidden"
				>
					<div
						className="flex h-[calc(100vh-5rem)] min-h-0 min-w-0 flex-col
							overflow-hidden"
					>
						<DialogClose
							className="absolute inset-e-2 top-2 z-10"
							render={<Button size="icon" variant="ghost" />}
						>
							<XIcon />
						</DialogClose>
						<div
							className="flex min-h-0 min-w-0 flex-1 flex-row overflow-hidden"
						>
							<DialogSidebar
								items={workbenchSections}
								activeId={activeTab}
								onSelect={(id) => setActiveTab(id as WebDavWorkbenchTab)}
							/>
							<section
								className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden
									bg-popover"
							>
								{activeTab === 'connection' && (
									<WebDavTabConnection
										config={config}
										password={password}
										testing={testing}
										saving={saving}
										onConfigChange={setConfig}
										onPasswordChange={setPassword}
										onTestConnection={handleTestConnection}
										onSaveConfig={handleSaveConfig}
										onDeleteConfig={handleDeleteConfig}
									/>
								)}
								{activeTab === 'sync' && (
									<WebDavTabSync
										config={config}
										syncing={syncing}
										canSync={canSync}
										syncResult={syncResult}
										onConfigChange={setConfig}
										onSync={handleSync}
									/>
								)}
							</section>
						</div>
					</div>
				</DialogPopup>
			</Dialog>
		</>
	);
}
