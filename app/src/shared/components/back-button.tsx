import { Pressable, Text } from 'react-native';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { ArrowLeft } from 'lucide-react-native';

import { useAppThemePalette } from '@/features/settings/providers/app-settings-provider';

export function BackButton({ onPress }: { onPress?: () => void }) {
	const { t } = useTranslation();
	const palette = useAppThemePalette();

	return (
		<Pressable
			onPress={onPress ?? (() => router.back())}
			className="h-9 flex-row items-center gap-1.5 self-start rounded-full px-4"
			style={{
				backgroundColor: palette.surfaceMuted,
				borderColor: palette.border,
				borderWidth: 1,
			}}
		>
			<ArrowLeft color={palette.icon} size={16} strokeWidth={2.2} />
			<Text className="text-[13px] font-semibold text-foreground">
				{t('common.actions.back')}
			</Text>
		</Pressable>
	);
}
