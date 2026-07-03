import { Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';
import {
	APP_THEME_BACKGROUND_COLORS,
	useResolvedThemePreference,
} from '@/features/settings';

export default function SettingsLayout() {
	const { t } = useTranslation();
	const resolvedTheme = useResolvedThemePreference();

	return (
		<Stack
			screenOptions={{
				animation: 'default',
				contentStyle: {
					backgroundColor: APP_THEME_BACKGROUND_COLORS[resolvedTheme],
				},
				headerShown: false,
			}}
		>
			<Stack.Screen name="index" options={{ title: t('tabs.settings') }} />
			<Stack.Screen
				name="editor"
				options={{ title: t('settings.sections.editor.label') }}
			/>
			<Stack.Screen
				name="appearance"
				options={{ title: t('settings.sections.appearance.label') }}
			/>
			<Stack.Screen
				name="ai"
				options={{ title: t('settings.editor.cards.ai.title') }}
			/>
			<Stack.Screen
				name="about"
				options={{ title: t('settings.sections.about.label') }}
			/>
		</Stack>
	);
}
