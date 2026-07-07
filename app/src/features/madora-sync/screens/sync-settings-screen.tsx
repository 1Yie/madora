import { useState, type ReactNode } from 'react';
import { Alert, Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import {
	CheckCircle2,
	Keyboard,
	Pencil,
	QrCode,
	RefreshCw,
	Trash2,
	Unplug,
	Wifi,
	WifiOff,
} from 'lucide-react-native';

import {
	APP_THEME_BACKGROUND_COLORS,
	SettingsCard,
	useAppThemePalette,
	useResolvedThemePreference,
} from '@/features/settings';
import { BackButton } from '@/shared/components';
import {
	NativeModal,
	NativeModalActions,
	NativeModalTextInput,
} from '@/components/ui/native-modal';
import { Switch } from '@/components/ui/switch';
import { QrScanner } from '../components/qr-scanner';
import {
	formatPairingEndpoint,
	formatSyncDisplayAddress,
	parsePairingEndpoint,
} from '../lib/protocol';
import { useMadoraSync } from '../providers/madora-sync-provider';

function formatLastSeen(timestamp: number) {
	return new Date(timestamp).toLocaleTimeString([], {
		hour: '2-digit',
		minute: '2-digit',
	});
}

function formatLastSync(timestamp: number | null) {
	if (!timestamp) return null;
	return new Date(timestamp).toLocaleString([], {
		day: '2-digit',
		hour: '2-digit',
		minute: '2-digit',
		month: 'short',
	});
}

function formatManualHostInput(host: {
	host: string;
	protocol?: 'ws' | 'wss' | null;
}) {
	const protocol = host.protocol === 'wss' ? 'https://' : 'http://';
	const address =
		host.host.includes(':') && !host.host.startsWith('[')
			? `[${host.host}]`
			: host.host;
	return `${protocol}${address}`;
}

export function SyncSettingsScreen({ onBack }: { onBack?: () => void }) {
	const { t } = useTranslation();
	const insets = useSafeAreaInsets();
	const resolvedTheme = useResolvedThemePreference();
	const palette = useAppThemePalette();
	const {
		connectionState,
		desktopAiCompletionAvailable,
		disconnect,
		errorMessage,
		lastSyncAt,
		localDeviceName,
		pairManually,
		pairedHost,
		pairFromQrPayload,
		reconnect,
		refreshRemoteFileTree,
		setLocalDeviceName,
		setSyncEnabled,
		setUseDesktopAiCompletion,
		syncEnabled,
		trustedDevices,
		useDesktopAiCompletion,
		removeTrustedDevice,
	} = useMadoraSync();
	const [scannerVisible, setScannerVisible] = useState(false);
	const [deviceNameDraft, setDeviceNameDraft] = useState<string | null>(null);
	const [manualPairingDraft, setManualPairingDraft] = useState<{
		code: string;
		host: string;
		port: string;
	} | null>(null);
	const [savingDeviceName, setSavingDeviceName] = useState(false);
	const [pairingManually, setPairingManually] = useState(false);
	const deviceNameModalOpen = deviceNameDraft !== null;
	const manualPairingModalOpen = manualPairingDraft !== null;
	const isConnected = connectionState === 'connected';
	const visibleDeviceName = deviceNameDraft ?? localDeviceName;
	const trimmedDeviceName = visibleDeviceName.trim();
	const canSaveDeviceName =
		trimmedDeviceName.length > 0 && trimmedDeviceName !== localDeviceName;
	const trimmedManualHost = manualPairingDraft?.host.trim() ?? '';
	const trimmedManualCode = manualPairingDraft?.code.trim() ?? '';
	const manualPortText = manualPairingDraft?.port.trim() ?? '';
	const manualPort = manualPortText ? Number(manualPortText) : null;
	const manualEndpoint = parsePairingEndpoint(trimmedManualHost, manualPort);
	const canManualPair = Boolean(manualEndpoint) && trimmedManualCode.length > 0;
	const canUseDesktopAiCompletion = isConnected && desktopAiCompletionAvailable;
	const desktopAiCompletionDescription = !isConnected
		? t('syncSettings.aiCompletion.connectFirst')
		: desktopAiCompletionAvailable
			? t('syncSettings.aiCompletion.useDesktopDetail')
			: t('syncSettings.aiCompletion.disabledOnDesktop');

	const handleScanned = async (raw: string) => {
		setScannerVisible(false);
		await pairFromQrPayload(raw);
	};

	const openManualPairingModal = () => {
		setManualPairingDraft({
			code: '',
			host: pairedHost ? formatManualHostInput(pairedHost) : '',
			port: pairedHost ? String(pairedHost.port) : '3210',
		});
	};

	const closeManualPairingModal = () => {
		if (pairingManually) return;
		setManualPairingDraft(null);
	};

	const updateManualPairingDraft = (
		key: 'code' | 'host' | 'port',
		value: string
	) => {
		setManualPairingDraft((current) =>
			current ? { ...current, [key]: value } : current
		);
	};

	const handleManualPair = async () => {
		if (!canManualPair || pairingManually) return;
		setPairingManually(true);
		try {
			const paired = await pairManually({
				address: trimmedManualHost,
				code: trimmedManualCode,
				port: manualPort,
			});
			if (paired) {
				setManualPairingDraft(null);
			}
		} finally {
			setPairingManually(false);
		}
	};

	const openDeviceNameModal = () => {
		setDeviceNameDraft(localDeviceName);
	};

	const closeDeviceNameModal = () => {
		if (savingDeviceName) return;
		setDeviceNameDraft(null);
	};

	const handleSaveDeviceName = async () => {
		if (!canSaveDeviceName || savingDeviceName) return;
		setSavingDeviceName(true);
		try {
			await setLocalDeviceName(trimmedDeviceName);
			setDeviceNameDraft(null);
		} finally {
			setSavingDeviceName(false);
		}
	};

	return (
		<View
			style={{
				flex: 1,
				backgroundColor: APP_THEME_BACKGROUND_COLORS[resolvedTheme],
			}}
		>
			<View
				pointerEvents="box-none"
				className="absolute left-4 z-10"
				style={{ top: insets.top + 12 }}
			>
				<BackButton onPress={onBack} />
			</View>

			<ScrollView
				style={{ flex: 1 }}
				contentContainerStyle={{
					gap: 16,
					paddingBottom: insets.bottom + 120,
					paddingHorizontal: 16,
					paddingTop: insets.top + 64,
				}}
			>
				<Text className="text-[24px] font-semibold text-foreground">
					{t('syncSettings.title')}
				</Text>

				<SettingsCard title={t('syncSettings.enable.cardTitle')}>
					<SwitchRow
						description={t('syncSettings.enable.detail')}
						onValueChange={(enabled) => void setSyncEnabled(enabled)}
						title={t('syncSettings.enable.title')}
						value={syncEnabled}
					/>
				</SettingsCard>

				<SettingsCard title={t('syncSettings.localDevice.title')}>
					<View className="gap-3">
						<View
							className="rounded-md px-3 py-3"
							style={{
								backgroundColor: palette.surfaceMuted,
								borderColor: palette.border,
								borderWidth: 1,
							}}
						>
							<Text className="text-[14px] font-semibold text-foreground">
								{localDeviceName}
							</Text>
						</View>
						<ActionButton
							icon={
								<Pencil
									color={palette.accentForeground}
									size={15}
									strokeWidth={2.1}
								/>
							}
							label={t('syncSettings.localDevice.edit')}
							onPress={openDeviceNameModal}
						/>
					</View>
				</SettingsCard>

				<SettingsCard title={t('syncSettings.pairing.title')}>
					<View className="gap-3">
						<View className="flex-1 gap-1">
							<Text className="text-[17px] font-semibold text-foreground">
								{pairedHost?.name ?? t('syncSettings.pairing.ready')}
							</Text>
							<Text className="text-[13px] leading-5 text-muted-foreground">
								{pairedHost
									? formatPairingEndpoint(pairedHost)
									: t('syncSettings.pairing.instructions')}
							</Text>
						</View>

						<View className="flex-row gap-3">
							<ActionButton
								icon={
									<QrCode
										color={palette.accentForeground}
										size={15}
										strokeWidth={2.1}
									/>
								}
								label={
									pairedHost
										? t('syncSettings.pairing.repair')
										: t('syncSettings.pairing.pair')
								}
								onPress={() => setScannerVisible(true)}
							/>
							<ActionButton
								icon={
									<Keyboard
										color={palette.foreground}
										size={15}
										strokeWidth={2.1}
									/>
								}
								label={t('syncSettings.pairing.manual')}
								onPress={openManualPairingModal}
								secondary
							/>
						</View>
						{pairedHost ? (
							<View className="flex-row gap-3">
								<ActionButton
									icon={
										<Unplug color={palette.icon} size={15} strokeWidth={2.1} />
									}
									label={t('common.actions.disconnect')}
									onPress={disconnect}
									secondary
								/>
							</View>
						) : null}

						{errorMessage ? (
							<Text className="text-[12px] leading-5 text-destructive">
								{errorMessage}
							</Text>
						) : null}
					</View>
				</SettingsCard>

				<SettingsCard title={t('syncSettings.connection.title')}>
					<View className="gap-3">
						<ConnectionStateRow
							label={t('syncSettings.connection.state')}
							state={connectionState}
							value={t(`common.status.${connectionState}`)}
						/>
						<InfoRow
							label={t('syncSettings.connection.lastSync')}
							value={
								formatLastSync(lastSyncAt) ??
								t('syncSettings.connection.neverSynced')
							}
						/>
						{errorMessage ? (
							<View
								className="rounded-md px-3 py-2"
								style={{
									backgroundColor: 'rgba(239, 68, 68, 0.12)',
									borderColor: 'rgba(239, 68, 68, 0.35)',
									borderWidth: 1,
								}}
							>
								<Text className="text-[12px] leading-5 text-destructive">
									{errorMessage}
								</Text>
							</View>
						) : null}
						{pairedHost && !isConnected ? (
							<ActionButton
								icon={
									<Wifi
										color={palette.accentForeground}
										size={15}
										strokeWidth={2.1}
									/>
								}
								label={t('syncSettings.connection.reconnect')}
								onPress={reconnect}
							/>
						) : null}
						<ActionButton
							disabled={!isConnected}
							icon={
								<RefreshCw
									color={palette.accentForeground}
									size={15}
									strokeWidth={2.1}
								/>
							}
							label={t('syncSettings.connection.refreshFiles')}
							onPress={() => void refreshRemoteFileTree()}
						/>
					</View>
				</SettingsCard>

				<SettingsCard title={t('syncSettings.aiCompletion.title')}>
					<SwitchRow
						disabled={!canUseDesktopAiCompletion}
						description={desktopAiCompletionDescription}
						onValueChange={(enabled) => void setUseDesktopAiCompletion(enabled)}
						title={t('syncSettings.aiCompletion.useDesktopTitle')}
						value={canUseDesktopAiCompletion && useDesktopAiCompletion}
					/>
				</SettingsCard>

				<SettingsCard title={t('syncSettings.trustedDevices.title')}>
					<View className="gap-2">
						{trustedDevices.length === 0 ? (
							<Text className="text-[13px] leading-5 text-muted-foreground">
								{t('syncSettings.emptyTrusted')}
							</Text>
						) : (
							trustedDevices.map((device) => (
								<View
									key={device.id}
									className="flex-row items-center justify-between gap-3
										rounded-md px-3 py-3"
									style={{
										backgroundColor: palette.surfaceMuted,
										borderColor: palette.border,
										borderWidth: 1,
									}}
								>
									<View className="flex-1 gap-1">
										<Text className="text-[14px] font-semibold text-foreground">
											{device.name}
										</Text>
										<Text className="text-[12px] text-muted-foreground">
											{device.kind} | {formatSyncDisplayAddress(device.address)}
										</Text>
									</View>
									<View className="items-end gap-1">
										<View className="flex-row items-center gap-1">
											<CheckCircle2
												color="#059669"
												size={13}
												strokeWidth={2.2}
											/>
											<Text
												className="text-[12px] font-semibold text-emerald-600"
											>
												{t('common.status.trusted')}
											</Text>
										</View>
										<Text className="text-[12px] text-muted-foreground">
											{formatLastSeen(device.lastSeen)}
										</Text>
									</View>
									<Pressable
										className="ml-2 items-center justify-center rounded-full
											p-2"
										style={({ pressed }) => ({
											backgroundColor: pressed
												? palette.surfaceMuted
												: 'transparent',
										})}
										onPress={() => {
											Alert.alert(
												t('common.actions.delete'),
												t('syncSettings.trustedDevices.removeConfirm', {
													name: device.name,
												}),
												[
													{
														text: t('common.actions.cancel'),
														style: 'cancel',
													},
													{
														text: t('common.actions.delete'),
														style: 'destructive',
														onPress: () => void removeTrustedDevice(device.id),
													},
												]
											);
										}}
									>
										<Trash2 color={palette.iconMuted} size={16} />
									</Pressable>
								</View>
							))
						)}
					</View>
				</SettingsCard>
			</ScrollView>

			<QrScanner
				onClose={() => setScannerVisible(false)}
				onScanned={handleScanned}
				visible={scannerVisible}
			/>
			<NativeModal
				isOpen={deviceNameModalOpen}
				title={t('syncSettings.localDevice.title')}
				onClose={closeDeviceNameModal}
				footer={
					<NativeModalActions
						cancelLabel={t('common.actions.cancel')}
						confirmLabel={t(
							savingDeviceName
								? 'syncSettings.localDevice.saving'
								: 'common.actions.save'
						)}
						onCancel={closeDeviceNameModal}
						onConfirm={
							canSaveDeviceName
								? () => void handleSaveDeviceName()
								: closeDeviceNameModal
						}
					/>
				}
			>
				<View className="gap-3">
					<Text className="text-[13px] leading-5 text-muted-foreground">
						{t('syncSettings.localDevice.detail')}
					</Text>
					<NativeModalTextInput
						autoCapitalize="words"
						autoCorrect={false}
						autoFocus
						onChangeText={setDeviceNameDraft}
						onSubmitEditing={() => void handleSaveDeviceName()}
						placeholder={t('syncSettings.localDevice.placeholder')}
						returnKeyType="done"
						value={visibleDeviceName}
					/>
				</View>
			</NativeModal>
			<NativeModal
				isOpen={manualPairingModalOpen}
				title={t('syncSettings.pairing.manualTitle')}
				onClose={closeManualPairingModal}
				footer={
					<NativeModalActions
						cancelLabel={t('common.actions.cancel')}
						confirmLabel={t(
							pairingManually
								? 'syncSettings.pairing.manualConnecting'
								: 'syncSettings.pairing.manualConnect'
						)}
						onCancel={closeManualPairingModal}
						onConfirm={() => void handleManualPair()}
					/>
				}
			>
				<View className="gap-3">
					<NativeModalTextInput
						autoCapitalize="none"
						autoCorrect={false}
						autoFocus
						keyboardType="numbers-and-punctuation"
						onChangeText={(value) => updateManualPairingDraft('host', value)}
						placeholder={t('syncSettings.pairing.manualHost')}
						returnKeyType="next"
						value={manualPairingDraft?.host ?? ''}
					/>
					<NativeModalTextInput
						autoCapitalize="none"
						autoCorrect={false}
						keyboardType="number-pad"
						onChangeText={(value) => updateManualPairingDraft('port', value)}
						placeholder={t('syncSettings.pairing.manualPort')}
						returnKeyType="next"
						value={manualPairingDraft?.port ?? ''}
					/>
					<NativeModalTextInput
						autoCapitalize="none"
						autoCorrect={false}
						keyboardType="number-pad"
						onChangeText={(value) => updateManualPairingDraft('code', value)}
						onSubmitEditing={() => void handleManualPair()}
						placeholder={t('syncSettings.pairing.manualCode')}
						returnKeyType="done"
						value={manualPairingDraft?.code ?? ''}
					/>
				</View>
			</NativeModal>
		</View>
	);
}

function SwitchRow({
	description,
	disabled,
	onValueChange,
	title,
	value,
}: {
	description: string;
	disabled?: boolean;
	onValueChange: (value: boolean) => void;
	title: string;
	value: boolean;
}) {
	const palette = useAppThemePalette();

	return (
		<View
			className="flex-row items-center justify-between gap-4"
			style={{ opacity: disabled ? 0.55 : 1 }}
		>
			<View className="flex-1 gap-1">
				<Text className="text-[14px] font-semibold text-foreground">
					{title}
				</Text>
				<Text
					className="text-[12px] leading-5"
					style={{ color: palette.mutedForeground }}
				>
					{description}
				</Text>
			</View>
			<Switch disabled={disabled} onValueChange={onValueChange} value={value} />
		</View>
	);
}

function InfoRow({ label, value }: { label: string; value: string }) {
	return (
		<View className="flex-row items-center justify-between gap-3">
			<Text className="text-[13px] text-muted-foreground">{label}</Text>
			<Text
				className="flex-1 text-right text-[13px] font-semibold text-foreground"
			>
				{value}
			</Text>
		</View>
	);
}

function ConnectionStateRow({
	label,
	state,
	value,
}: {
	label: string;
	state: string;
	value: string;
}) {
	const color =
		state === 'connected'
			? '#059669'
			: state === 'disconnected'
				? '#71717a'
				: '#0284c7';
	const Icon = state === 'disconnected' ? WifiOff : Wifi;

	return (
		<View className="flex-row items-center justify-between gap-3">
			<Text className="text-[13px] text-muted-foreground">{label}</Text>
			<View className="flex-row items-center gap-1.5">
				<Icon color={color} size={14} strokeWidth={2.2} />
				<Text className="text-[13px] font-semibold" style={{ color }}>
					{value}
				</Text>
			</View>
		</View>
	);
}

function ActionButton({
	disabled = false,
	icon,
	label,
	onPress,
	secondary = false,
}: {
	disabled?: boolean;
	icon?: ReactNode;
	label: string;
	onPress: () => void;
	secondary?: boolean;
}) {
	const palette = useAppThemePalette();

	return (
		<Pressable
			disabled={disabled}
			onPress={onPress}
			className={`min-h-10 flex-1 flex-row items-center justify-center gap-1.5
				rounded-md px-4 py-2 ${disabled ? 'opacity-40' : ''}`}
			style={{
				backgroundColor: secondary
					? palette.surfaceMuted
					: palette.accentSurface,
			}}
		>
			{icon}
			<Text
				className="text-[13px] font-semibold"
				numberOfLines={1}
				style={{
					color: secondary ? palette.foreground : palette.accentForeground,
				}}
			>
				{label}
			</Text>
		</Pressable>
	);
}
