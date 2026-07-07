import { Pressable, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Settings } from 'lucide-react-native';

import { useAppThemePalette } from '@/features/settings';

export function RemoteNotConnectedState({
	onOpenSyncSettings,
}: {
	onOpenSyncSettings: () => void;
}) {
	const { t } = useTranslation();
	const palette = useAppThemePalette();

	return (
		<View className="flex-1 bg-background px-5 pt-8">
			<View className="gap-4">
				<View className="gap-2">
					<Text className="text-[22px] font-semibold text-foreground">
						{t('fileTree.remoteNotConnected.title')}
					</Text>
					<Text className="text-[14px] leading-5 text-muted-foreground">
						{t('fileTree.remoteNotConnected.detail')}
					</Text>
				</View>
				<View className="flex-row gap-2">
					<Pressable
						accessibilityLabel={t('fileTree.remoteNotConnected.action')}
						onPress={onOpenSyncSettings}
						className="min-h-9 flex-1 flex-row items-center justify-center gap-2
							rounded-md px-3"
						style={{
							backgroundColor: palette.surfaceMuted,
							borderColor: palette.border,
							borderWidth: 1,
							flex: 1,
							minWidth: 0,
						}}
					>
						<Settings color={palette.icon} size={16} strokeWidth={2.2} />
						<Text
							numberOfLines={1}
							className="text-[13px] font-semibold text-foreground"
						>
							{t('fileTree.remoteNotConnected.action')}
						</Text>
					</Pressable>
				</View>
			</View>
		</View>
	);
}
