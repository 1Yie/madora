import {
	Cloud,
	CloudSlash as CloudOff,
	Globe,
	CircleNotch as Loader2,
	ArrowsClockwise as RefreshCw,
	GearSix as Settings2,
} from '@phosphor-icons/react';
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
import { DialogWorkbench } from '@/components/ui/dialog-workbench';
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from '@/components/ui/tooltip';
import { showErrorToast, showSuccessToast } from '@/components/ui/toast';
import { useTranslation } from 'react-i18next';
import { WebDavTabConnection } from './tab/connection';
import { WebDavTabSync } from './tab/sync';

type WebDavWorkbenchTab = 'connection' | 'sync';

type WebDavPanelProps = {
	disabled?: boolean;
	workspaceRoot: string | null;
};

export function WebDavPanel({
	disabled = false,
	workspaceRoot,
}: WebDavPanelProps) {
	const { t } = useTranslation();

	const workbenchSections = [
		{
			id: 'connection' as WebDavWorkbenchTab,
			label: t('webdav.tab.connection'),
			description: t('webdav.tab.connectionDesc'),
			icon: Globe,
		},
		{
			id: 'sync' as WebDavWorkbenchTab,
			label: t('webdav.tab.sync'),
			description: t('webdav.tab.syncDesc'),
			icon: RefreshCw,
		},
	];

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
					result.server_name
						? t('webdav.connectSuccessWithName', { name: result.server_name })
						: t('webdav.connectSuccess')
				);
			} else {
				showErrorToast(
					t('webdav.connectFailed'),
					result.error ?? t('common.unknown')
				);
			}
		} catch (err) {
			showErrorToast(t('webdav.testConnectionError'), String(err));
		} finally {
			setTesting(false);
		}
	}, [config, password]);

	const handleSaveConfig = useCallback(async () => {
		if (!config) return;
		setSaving(true);
		try {
			await webdavSaveConfig(config, password || undefined);
			showSuccessToast(t('webdav.configSaved'));
		} catch (err) {
			showErrorToast(t('webdav.saveConfigFailed'), String(err));
		} finally {
			setSaving(false);
		}
	}, [config, password]);

	const handleDeleteConfig = useCallback(async () => {
		try {
			await webdavDeleteConfig();
			setConfig(null);
			setPassword('');
			showSuccessToast(t('webdav.configCleared'));
		} catch (err) {
			showErrorToast(t('webdav.deleteConfigFailed'), String(err));
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
				showErrorToast(
					t('webdav.syncCompletedWithErrors'),
					t('webdav.errorCount', { count: result.errors.length })
				);
			} else {
				showSuccessToast(
					t('webdav.syncComplete', {
						uploaded: result.files_uploaded,
						downloaded: result.files_downloaded,
					})
				);
			}
		} catch (err) {
			showErrorToast(t('webdav.syncFailed'), String(err));
		} finally {
			setSyncing(false);
		}
	}, [canSync, workspaceRoot, config, password]);

	// ── Status bar ──

	const statusBar = !config?.url ? (
		<div className="flex w-full items-center gap-2 px-2 py-1 leading-4">
			<CloudOff className="size-3.5 shrink-0 text-muted-foreground" />
			<span className="flex-1 truncate text-muted-foreground">
				{t('webdav.notConfigured')}
			</span>
			<Button
				size="icon-xs"
				variant="ghost"
				onClick={handleOpenWorkbench}
				aria-label={t('webdav.configureLabel')}
			>
				<Settings2 className="size-3.5" />
			</Button>
		</div>
	) : (
		<div className="flex w-full items-center gap-2 px-2 py-1 leading-4">
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
						className="min-w-0 flex-1 truncate text-left leading-4
							text-muted-foreground"
						render={<span />}
					>
						{config.last_sync_at
							? t('webdav.lastSyncAt', {
									time: new Date(config.last_sync_at).toLocaleString(),
								})
							: t('webdav.notSyncedYet')}
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
					aria-label={t('webdav.syncLabel')}
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
					aria-label={t('webdav.settingsLabel')}
				>
					<Settings2 className="size-3.5" />
				</Button>
			</div>
		</div>
	);

	return (
		<>
			{statusBar}

			<DialogWorkbench
				open={workbenchOpen}
				onOpenChange={setWorkbenchOpen}
				title="WebDAV"
				items={workbenchSections}
				activeId={activeTab}
				onSelect={(id) => setActiveTab(id as WebDavWorkbenchTab)}
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
			</DialogWorkbench>
		</>
	);
}
