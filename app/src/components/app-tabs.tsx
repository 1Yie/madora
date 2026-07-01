import { Tabs } from 'expo-router';
import { useTranslation } from 'react-i18next';
import CustomTabBar from '../components/ui/custom-tab-bar';
import { MarkdownToolbarProvider } from '../features/madora-sync/markdown-toolbar-context';

export default function AppTabs() {
	const { t } = useTranslation();

	return (
		<MarkdownToolbarProvider>
			<Tabs
				screenOptions={{ headerShown: false }}
				tabBar={(props) => <CustomTabBar {...props} />}
			>
				<Tabs.Screen name="index" options={{ title: t('tabs.workspace') }} />
				<Tabs.Screen name="settings" options={{ title: t('tabs.settings') }} />
			</Tabs>
		</MarkdownToolbarProvider>
	);
}
