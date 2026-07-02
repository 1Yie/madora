import { useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';

import { QrScanner } from '../components/qr-scanner';
import {
	ActionButton,
	MetricTile,
	Panel,
	SectionHeading,
	StatusPill,
} from '../components/sync-ui';
import { useMadoraSync } from '../providers/madora-sync-provider';

function formatLastSeen(timestamp: number) {
	return new Date(timestamp).toLocaleTimeString([], {
		hour: '2-digit',
		minute: '2-digit',
	});
}

export function SyncSettingsScreen() {
	const { t } = useTranslation();
	const insets = useSafeAreaInsets();
	const {
		connectionState,
		disconnect,
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
		<View style={{ flex: 1, backgroundColor: '#fbfcff' }}>
			<ScrollView
				style={{ flex: 1 }}
				contentContainerStyle={{
					gap: 16,
					paddingBottom: insets.bottom + 120,
					paddingHorizontal: 16,
					paddingTop: insets.top + 64,
				}}
			>
				<SectionHeading
					detail={t('syncSettings.pairing.detail')}
					eyebrow={t('syncSettings.eyebrow')}
					title={t('syncSettings.pairing.title')}
				/>

				<Panel className="gap-4">
					<StatusPill
						label={pairedHost ? connectionState : undefined}
						state={connectionState}
					/>

					{pairedHost ? (
						<>
							<Text className="text-[18px] font-semibold text-foreground">
								{pairedHost.name}
							</Text>
							<Text className="text-[13px] leading-5 text-muted-foreground">
								{pairedHost.host}:{pairedHost.port}
							</Text>
						</>
					) : (
						<>
							<Text className="text-[18px] font-semibold text-foreground">
								{t('syncSettings.pairing.ready')}
							</Text>
							<Text className="text-[13px] leading-5 text-muted-foreground">
								{t('syncSettings.pairing.instructions')}
							</Text>
						</>
					)}

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
								label={t('common.actions.disconnect')}
								onPress={disconnect}
								variant="secondary"
							/>
						) : null}
					</View>
				</Panel>

				{pairedHost ? (
					<Panel className="gap-4">
						<View className="gap-1">
							<Text className="text-[16px] font-semibold text-foreground">
								{t('syncSettings.connection.title')}
							</Text>
							<Text className="text-[13px] leading-5 text-muted-foreground">
								{t('syncSettings.connection.detail')}
							</Text>
						</View>
						<View className="flex-row gap-3">
							<ActionButton
								label={t('syncSettings.connection.refreshFiles')}
								onPress={() => void refreshRemoteFileTree()}
								variant="ghost"
							/>
						</View>
					</Panel>
				) : null}

				<Panel className="gap-4">
					<View className="gap-1">
						<Text className="text-[16px] font-semibold text-foreground">
							{t('syncSettings.trustedDevices.title')}
						</Text>
						<Text className="text-[13px] leading-5 text-muted-foreground">
							{t('syncSettings.trustedDevices.detail')}
						</Text>
					</View>

					<View className="gap-2">
						{trustedDevices.map((device) => (
							<View
								key={device.id}
								className="flex-row items-center justify-between rounded-md
									border border-border bg-secondary px-3 py-3"
							>
								<View className="flex-1 gap-1">
									<Text className="text-[14px] font-medium text-foreground">
										{device.name}
									</Text>
									<Text className="text-[12px] text-muted-foreground">
										{device.kind} | {device.address}
									</Text>
								</View>
								<View className="items-end gap-2">
									<StatusPill state="trusted" />
									<Text className="text-[12px] text-muted-foreground">
										{formatLastSeen(device.lastSeen)}
									</Text>
								</View>
							</View>
						))}
						{trustedDevices.length === 0 ? (
							<Text className="text-[13px] text-muted-foreground">
								{t('syncSettings.emptyTrusted')}
							</Text>
						) : null}
					</View>
				</Panel>

				<Panel className="gap-3">
					<View className="gap-1">
						<Text className="text-[16px] font-semibold text-foreground">
							{t('syncSettings.localStore.title')}
						</Text>
						<Text className="text-[13px] leading-5 text-muted-foreground">
							{t('syncSettings.localStore.detail')}
						</Text>
					</View>

					<View className="flex-row gap-3">
						<MetricTile
							label={t('syncSettings.metrics.trusted')}
							value={String(storageStats.trustedDevices)}
						/>
					</View>
				</Panel>
			</ScrollView>

			<QrScanner
				onClose={() => setScannerVisible(false)}
				onScanned={handleScanned}
				visible={scannerVisible}
			/>
		</View>
	);
}
