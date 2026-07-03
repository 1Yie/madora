import { useState, type ReactNode } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import {
	CheckCircle2,
	Cloud,
	Database,
	MonitorSmartphone,
	RefreshCw,
	ShieldCheck,
	Unplug,
} from 'lucide-react-native';

import {
	APP_THEME_BACKGROUND_COLORS,
	SettingsCard,
	useAppThemePalette,
	useResolvedThemePreference,
} from '@/features/settings';
import { BackButton } from '@/shared/components';
import { QrScanner } from '../components/qr-scanner';
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

export function SyncSettingsScreen({ onBack }: { onBack?: () => void }) {
	const { t } = useTranslation();
	const insets = useSafeAreaInsets();
	const resolvedTheme = useResolvedThemePreference();
	const palette = useAppThemePalette();
	const {
		connectionState,
		disconnect,
		errorMessage,
		lastSyncAt,
		pairedHost,
		pairFromQrPayload,
		refreshRemoteFileTree,
		storageStats,
		trustedDevices,
	} = useMadoraSync();
	const [scannerVisible, setScannerVisible] = useState(false);

	const handleScanned = async (raw: string) => {
		setScannerVisible(false);
		await pairFromQrPayload(raw);
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

				<SettingsCard title={t('syncSettings.pairing.title')}>
					<View className="gap-3">
						<View className="flex-1 gap-1">
							<Text className="text-[17px] font-semibold text-foreground">
								{pairedHost?.name ?? t('syncSettings.pairing.ready')}
							</Text>
							<Text className="text-[13px] leading-5 text-muted-foreground">
								{pairedHost
									? `${pairedHost.host}:${pairedHost.port}`
									: t('syncSettings.pairing.instructions')}
							</Text>
						</View>

						<View className="flex-row gap-3">
							<ActionButton
								label={
									pairedHost
										? t('syncSettings.pairing.repair')
										: t('syncSettings.pairing.pair')
								}
								onPress={() => setScannerVisible(true)}
							/>
							{pairedHost ? (
								<ActionButton
									icon={
										<Unplug color={palette.icon} size={15} strokeWidth={2.1} />
									}
									label={t('common.actions.disconnect')}
									onPress={disconnect}
									secondary
								/>
							) : null}
						</View>

						{errorMessage ? (
							<Text className="text-[12px] leading-5 text-destructive">
								{errorMessage}
							</Text>
						) : null}
					</View>
				</SettingsCard>

				<SettingsCard title={t('syncSettings.connection.title')}>
					<View className="gap-3">
						<InfoRow
							label={t('syncSettings.connection.state')}
							value={t(`common.status.${connectionState}`)}
						/>
						<InfoRow
							label={t('syncSettings.connection.lastSync')}
							value={
								formatLastSync(lastSyncAt) ??
								t('syncSettings.connection.neverSynced')
							}
						/>
						<ActionButton
							disabled={!pairedHost}
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
											{device.kind} | {device.address}
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
								</View>
							))
						)}
					</View>
				</SettingsCard>

				<SettingsCard title={t('syncSettings.localStore.title')}>
					<View
						className="rounded-md px-3 py-3"
						style={{
							backgroundColor: palette.surfaceMuted,
							borderColor: palette.border,
							borderWidth: 1,
						}}
					>
						<Text
							className="text-[12px] font-semibold uppercase
								text-muted-foreground"
						>
							{t('syncSettings.metrics.trusted')}
						</Text>
						<Text className="mt-1 text-[24px] font-semibold text-foreground">
							{storageStats.trustedDevices}
						</Text>
					</View>
				</SettingsCard>
			</ScrollView>

			<QrScanner
				onClose={() => setScannerVisible(false)}
				onScanned={handleScanned}
				visible={scannerVisible}
			/>
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
				style={{
					color: secondary ? palette.foreground : palette.accentForeground,
				}}
			>
				{label}
			</Text>
		</Pressable>
	);
}
