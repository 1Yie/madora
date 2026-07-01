import { Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';

export default function SettingsLayout() {
	const { t } = useTranslation();

	return (
		<Stack
			screenOptions={{
				animation: 'slide_from_right',
				contentStyle: { backgroundColor: '#fbfcff' },
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
