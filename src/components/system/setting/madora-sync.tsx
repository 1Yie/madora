import {
	BadgeCheck,
	LoaderCircle,
	MonitorSmartphone,
	QrCode,
	RefreshCw,
	ShieldCheck,
	Smartphone,
	Wifi,
	WifiOff,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
	madoraSyncClearPairingCode,
	madoraSyncGetConfig,
	madoraSyncGetPairingQr,
	madoraSyncIssuePairingCode,
	madoraSyncRemovePairedDevice,
	madoraSyncSaveSettings,
	type MadoraSyncConfig,
	type MadoraSyncConnectionState,
	type MadoraSyncPairingQr,
} from '@/invoke/madora-sync';
import { QRCodeSVG } from '@rc-component/qrcode';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import {
	FieldBlock,
	SettingRow,
	SettingsSectionCard,
} from '@/components/system/setting/shared';
import { showErrorToast, showSuccessToast } from '@/components/ui/toast';

function getConnectionBadgeVariant(state: MadoraSyncConnectionState) {
	switch (state) {
		case 'connected':
			return 'success' as const;
		case 'syncing':
		case 'discovering':
		case 'connecting':
		case 'authenticating':
			return 'info' as const;
		default:
			return 'outline' as const;
	}
}

function renderConnectionIcon(state: MadoraSyncConnectionState) {
	switch (state) {
		case 'connected':
			return <Wifi />;
		case 'discovering':
		case 'connecting':
		case 'authenticating':
		case 'syncing':
			return <RefreshCw className="animate-spin" />;
		default:
			return <WifiOff />;
	}
}

export function MadoraSyncSettings() {
	const { t } = useTranslation();
	const [config, setConfig] = useState<MadoraSyncConfig | null>(null);
	const [deviceName, setDeviceName] = useState('');
	const [port, setPort] = useState('3210');
	const [loading, setLoading] = useState(true);
	const [saving, setSaving] = useState(false);
	const [pairingBusy, setPairingBusy] = useState(false);
	const [pairingQr, setPairingQr] = useState<MadoraSyncPairingQr | null>(null);

	useEffect(() => {
		let cancelled = false;

		async function loadConfig() {
			try {
				const nextConfig = await madoraSyncGetConfig();
				if (cancelled) return;
				setConfig(nextConfig);
				setDeviceName(nextConfig.deviceName);
				setPort(String(nextConfig.port));
			} catch (error) {
				if (!cancelled) {
					showErrorToast(
						t('settings.sync.madora.toasts.loadFailed'),
						String(error)
					);
				}
			} finally {
				if (!cancelled) {
					setLoading(false);
				}
			}
		}

		void loadConfig();

		return () => {
			cancelled = true;
		};
	}, [t]);

	async function refreshPairingQr() {
		try {
			setPairingQr(await madoraSyncGetPairingQr());
		} catch (error) {
			showErrorToast(
				t('settings.sync.madora.toasts.pairingQrFailed'),
				String(error)
			);
		}
	}

	useEffect(() => {
		if (!config?.enabled) return;

		let cancelled = false;

		async function fetchPairingQr() {
			try {
				const nextPairingQr = await madoraSyncGetPairingQr();
				if (!cancelled) {
					setPairingQr(nextPairingQr);
				}
			} catch (error) {
				if (!cancelled) {
					showErrorToast(
						t('settings.sync.madora.toasts.pairingQrFailed'),
						String(error)
					);
				}
			}
		}

		void fetchPairingQr();

		return () => {
			cancelled = true;
		};
	}, [config?.enabled, t]);

	const canSave = !!config && deviceName.trim().length > 0;
	const lastSyncText = !config?.lastSyncAt
		? t('settings.sync.madora.status.neverSynced')
		: new Date(config.lastSyncAt).toLocaleString();

	const handleSave = async () => {
		if (!config) return;

		const parsedPort = Number(port);
		if (
			!Number.isInteger(parsedPort) ||
			parsedPort <= 0 ||
			parsedPort > 65535
		) {
			showErrorToast(
				t('settings.sync.madora.toasts.saveFailed'),
				t('settings.sync.madora.validation.invalidPort')
			);
			return;
		}

		setSaving(true);
		try {
			const nextConfig = await madoraSyncSaveSettings({
				enabled: config.enabled,
				allowLanDiscovery: config.allowLanDiscovery,
				autoStartServer: config.autoStartServer,
				deviceName: deviceName.trim(),
				port: parsedPort,
				shareAiCompletions: config.shareAiCompletions,
			});
			setConfig(nextConfig);
			setDeviceName(nextConfig.deviceName);
			setPort(String(nextConfig.port));
			if (nextConfig.enabled) {
				void refreshPairingQr();
			} else {
				setPairingQr(null);
			}
			showSuccessToast(t('settings.sync.madora.toasts.saved'));
		} catch (error) {
			showErrorToast(
				t('settings.sync.madora.toasts.saveFailed'),
				String(error)
			);
		} finally {
			setSaving(false);
		}
	};

	const updateToggle = async (
		key: 'autoStartServer' | 'allowLanDiscovery' | 'shareAiCompletions',
		value: boolean
	) => {
		if (!config) return;
		const optimistic = { ...config, [key]: value };
		setConfig(optimistic);
		try {
			const nextConfig = await madoraSyncSaveSettings({
				enabled: optimistic.enabled,
				allowLanDiscovery: optimistic.allowLanDiscovery,
				autoStartServer: optimistic.autoStartServer,
				deviceName: optimistic.deviceName,
				port: optimistic.port,
				shareAiCompletions: optimistic.shareAiCompletions,
			});
			setConfig(nextConfig);
			if (nextConfig.enabled) {
				void refreshPairingQr();
			}
		} catch (error) {
			setConfig(config);
			showErrorToast(
				t('settings.sync.madora.toasts.saveFailed'),
				String(error)
			);
		}
	};

	const handleEnabledChange = async (enabled: boolean) => {
		if (!config) return;
		const optimistic = { ...config, enabled };
		setConfig(optimistic);
		try {
			const nextConfig = await madoraSyncSaveSettings({
				enabled: optimistic.enabled,
				allowLanDiscovery: optimistic.allowLanDiscovery,
				autoStartServer: optimistic.autoStartServer,
				deviceName: optimistic.deviceName,
				port: optimistic.port,
				shareAiCompletions: optimistic.shareAiCompletions,
			});
			setConfig(nextConfig);
			if (nextConfig.enabled) {
				void refreshPairingQr();
			} else {
				setPairingQr(null);
			}
		} catch (error) {
			setConfig(config);
			showErrorToast(
				t('settings.sync.madora.toasts.saveFailed'),
				String(error)
			);
		}
	};

	const handleIssuePairingCode = async () => {
		setPairingBusy(true);
		try {
			const issued = await madoraSyncIssuePairingCode();
			setConfig((prev) =>
				prev
					? {
							...prev,
							activePairingCode: issued.code,
							pairingCodeExpiresAt: issued.expiresAt,
						}
					: prev
			);
			await refreshPairingQr();
			showSuccessToast(t('settings.sync.madora.toasts.pairingCodeIssued'));
		} catch (error) {
			showErrorToast(
				t('settings.sync.madora.toasts.pairingCodeFailed'),
				String(error)
			);
		} finally {
			setPairingBusy(false);
		}
	};

	const handleClearPairingCode = async () => {
		setPairingBusy(true);
		try {
			const nextConfig = await madoraSyncClearPairingCode();
			setConfig(nextConfig);
			setPairingQr(null);
		} catch (error) {
			showErrorToast(
				t('settings.sync.madora.toasts.pairingCodeFailed'),
				String(error)
			);
		} finally {
			setPairingBusy(false);
		}
	};

	const handleRemovePairedDevice = async (deviceId: string) => {
		try {
			const nextConfig = await madoraSyncRemovePairedDevice(deviceId);
			setConfig(nextConfig);
		} catch (error) {
			showErrorToast(
				t('settings.sync.madora.toasts.removeDeviceFailed'),
				String(error)
			);
		}
	};

	if (loading) {
		return (
			<SettingsSectionCard title={t('settings.sync.madora.cards.status.title')}>
				<div className="flex items-center gap-2 text-sm text-muted-foreground">
					<LoaderCircle className="size-4 animate-spin" />
					<span>{t('common.status.loading')}</span>
				</div>
			</SettingsSectionCard>
		);
	}

	if (!config) return null;

	return (
		<div className="space-y-4">
			<SettingsSectionCard title={t('settings.sync.madora.cards.status.title')}>
				<div className="space-y-4">
					<SettingRow
						title={t('settings.sync.madora.rows.enabled.title')}
						description={t('settings.sync.madora.rows.enabled.description')}
					>
						<Switch
							checked={config.enabled}
							disabled={saving || pairingBusy}
							onCheckedChange={(checked) => void handleEnabledChange(checked)}
						/>
					</SettingRow>
					<div className="grid gap-3 md:grid-cols-3">
						<div className="rounded-lg border bg-background px-4 py-3">
							<div className="text-xs text-muted-foreground">
								{t('settings.sync.madora.status.connection')}
							</div>
							<div className="mt-2 flex items-center gap-2">
								<Badge
									variant={getConnectionBadgeVariant(config.connectionState)}
								>
									{renderConnectionIcon(config.connectionState)}
									{t(
										`settings.sync.madora.connectionStates.${config.connectionState}`
									)}
								</Badge>
							</div>
						</div>
						<div className="rounded-lg border bg-background px-4 py-3">
							<div className="text-xs text-muted-foreground">
								{t('settings.sync.madora.status.lastSync')}
							</div>
							<div className="mt-2 text-sm font-medium text-foreground">
								{lastSyncText}
							</div>
						</div>
						<div className="rounded-lg border bg-background px-4 py-3">
							<div className="text-xs text-muted-foreground">
								{t('settings.sync.madora.status.pairedDevices')}
							</div>
							<div className="mt-2 text-sm font-medium text-foreground">
								{config.pairedDevices.length}
							</div>
						</div>
					</div>
				</div>
				{config.lastError && (
					<div
						className="mt-3 rounded-lg border border-destructive/20
							bg-destructive/6 px-4 py-3 text-sm text-destructive-foreground"
					>
						{config.lastError}
					</div>
				)}
			</SettingsSectionCard>

			{config.enabled ? (
				<>
					<SettingsSectionCard
						title={t('settings.sync.madora.cards.pairing.title')}
					>
						<div className="space-y-4">
							<div className="grid gap-4 lg:grid-cols-[220px_minmax(0,1fr)]">
								<div
									className="flex items-center justify-center rounded-lg border
										bg-background p-4"
								>
									{pairingQr?.payload ? (
										<QRCodeSVG
											bgColor="transparent"
											fgColor="currentColor"
											level="M"
											size={180}
											value={pairingQr.payload}
										/>
									) : (
										<div
											className="flex flex-col items-center gap-2 text-center
												text-muted-foreground"
										>
											<QrCode className="size-10" />
											<p className="text-xs">
												{t('settings.sync.madora.status.qrUnavailable')}
											</p>
										</div>
									)}
								</div>
								<div
									className="rounded-lg border bg-background px-4 py-4
										text-center tabular-nums lg:text-left"
								>
									<div className="text-xs text-muted-foreground">
										{t('settings.sync.madora.fields.pairingCode')}
									</div>
									<div className="mt-2 text-3xl font-semibold text-foreground">
										{pairingQr?.code ?? config.activePairingCode ?? '------'}
									</div>
									<div className="mt-2 text-xs text-muted-foreground">
										{(pairingQr?.expiresAt ?? config.pairingCodeExpiresAt)
											? t('settings.sync.madora.status.expiresAt', {
													time: new Date(
														pairingQr?.expiresAt ??
															config.pairingCodeExpiresAt ??
															''
													).toLocaleString(),
												})
											: t('settings.sync.madora.status.noPairingCode')}
									</div>
									<div className="mt-4 space-y-1 text-xs text-muted-foreground">
										<div>
											{t('settings.sync.madora.status.primaryHost')}:{' '}
											{pairingQr?.primaryHost ??
												t('settings.sync.madora.status.noReachableHost')}
										</div>
										<div>
											{t('settings.sync.madora.fields.port')}:{' '}
											{pairingQr?.port ?? config.port}
										</div>
										{pairingQr?.availableHosts.length ? (
											<div>
												{t('settings.sync.madora.status.availableHosts')}:{' '}
												{pairingQr.availableHosts.join(', ')}
											</div>
										) : null}
									</div>
								</div>
							</div>
							<div className="flex flex-wrap gap-2">
								<Button
									loading={pairingBusy}
									onClick={handleIssuePairingCode}
									variant="outline"
								>
									<ShieldCheck />
									{t('settings.sync.madora.actions.refreshPairingQr')}
								</Button>
								<Button
									disabled={!config.activePairingCode}
									loading={pairingBusy}
									onClick={handleClearPairingCode}
									variant="ghost"
								>
									{t('settings.sync.madora.actions.clearPairingCode')}
								</Button>
							</div>
						</div>
					</SettingsSectionCard>

					<SettingsSectionCard
						title={t('settings.sync.madora.cards.features.title')}
					>
						<div className="space-y-3">
							<SettingRow
								title={t('settings.sync.madora.rows.autoStart.title')}
								description={t(
									'settings.sync.madora.rows.autoStart.description'
								)}
							>
								<Switch
									checked={config.autoStartServer}
									onCheckedChange={(checked) =>
										void updateToggle('autoStartServer', checked)
									}
								/>
							</SettingRow>
							<SettingRow
								title={t('settings.sync.madora.rows.lanDiscovery.title')}
								description={t(
									'settings.sync.madora.rows.lanDiscovery.description'
								)}
							>
								<Switch
									checked={config.allowLanDiscovery}
									onCheckedChange={(checked) =>
										void updateToggle('allowLanDiscovery', checked)
									}
								/>
							</SettingRow>
							<SettingRow
								title={t('settings.sync.madora.rows.aiSharing.title')}
								description={t(
									'settings.sync.madora.rows.aiSharing.description'
								)}
							>
								<Switch
									checked={config.shareAiCompletions}
									onCheckedChange={(checked) =>
										void updateToggle('shareAiCompletions', checked)
									}
								/>
							</SettingRow>
						</div>
					</SettingsSectionCard>

					<SettingsSectionCard
						title={t('settings.sync.madora.cards.host.title')}
					>
						<div className="space-y-4">
							<FieldBlock
								label={t('settings.sync.madora.fields.deviceName')}
								icon={<MonitorSmartphone />}
							>
								<Input
									disabled={saving}
									value={deviceName}
									onChange={(event) => setDeviceName(event.target.value)}
								/>
							</FieldBlock>
							<FieldBlock
								label={t('settings.sync.madora.fields.port')}
								hint={t('settings.sync.madora.hints.port')}
								icon={<Wifi />}
							>
								<Input
									disabled={saving}
									inputMode="numeric"
									value={port}
									onChange={(event) => setPort(event.target.value)}
								/>
							</FieldBlock>
							<div className="flex justify-end">
								<Button
									disabled={!canSave}
									loading={saving}
									onClick={handleSave}
								>
									{t('common.actions.save')}
								</Button>
							</div>
						</div>
					</SettingsSectionCard>

					<SettingsSectionCard
						title={t('settings.sync.madora.cards.devices.title')}
					>
						<div className="space-y-3">
							{config.pairedDevices.length === 0 ? (
								<div
									className="rounded-lg border bg-background px-4 py-3 text-sm
										text-muted-foreground"
								>
									{t('settings.sync.madora.empty.devices')}
								</div>
							) : (
								config.pairedDevices.map((device) => (
									<div
										key={device.id}
										className="flex items-center justify-between gap-4
											rounded-lg border bg-background px-4 py-3"
									>
										<div className="min-w-0">
											<div className="flex items-center gap-2">
												<Smartphone className="size-4 text-muted-foreground" />
												<span
													className="truncate text-sm font-medium
														text-foreground"
												>
													{device.name}
												</span>
												{device.trusted && (
													<Badge variant="success" size="sm">
														<BadgeCheck />
														{t('settings.sync.madora.status.trusted')}
													</Badge>
												)}
											</div>
											<div className="mt-1 text-xs text-muted-foreground">
												{device.platform ??
													t('settings.sync.madora.status.unknownPlatform')}
												{device.lastSeenAt
													? ` · ${t('settings.sync.madora.status.lastSeenAt', {
															time: new Date(
																device.lastSeenAt
															).toLocaleString(),
														})}`
													: ''}
											</div>
										</div>
										<Button
											onClick={() => void handleRemovePairedDevice(device.id)}
											size="sm"
											variant="ghost"
										>
											{t('settings.sync.madora.actions.removeDevice')}
										</Button>
									</div>
								))
							)}
						</div>
					</SettingsSectionCard>
				</>
			) : null}
		</div>
	);
}
