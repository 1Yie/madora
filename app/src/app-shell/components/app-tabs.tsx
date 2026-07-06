import { useEffect, useState } from 'react';
import { Tabs } from 'expo-router';
import { DeviceEventEmitter, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import {
	MarkdownToolbarProvider,
	WORKSPACE_EDITOR_OVERLAY_ACTIVE_EVENT,
} from '@/features/editor';
import {
	APP_THEME_BACKGROUND_COLORS,
	useResolvedThemePreference,
} from '@/features/settings';
import { AppEdgeFade } from '@/shared/components';
import CustomTabBar from './custom-tab-bar';

const FADE_EXTRA_TOP = 0;
const FADE_EXTRA_BOTTOM = 18;

export default function AppTabs() {
	const { t } = useTranslation();
	const insets = useSafeAreaInsets();
	const resolvedTheme = useResolvedThemePreference();
	const backgroundColor = APP_THEME_BACKGROUND_COLORS[resolvedTheme];
	const [workspaceOverlayActive, setWorkspaceOverlayActive] = useState(false);

	useEffect(() => {
		const subscription = DeviceEventEmitter.addListener(
			WORKSPACE_EDITOR_OVERLAY_ACTIVE_EVENT,
			(active: unknown) => {
				setWorkspaceOverlayActive(Boolean(active));
			}
		);

		return () => subscription.remove();
	}, []);

	return (
		<MarkdownToolbarProvider>
			<View className="relative flex-1" style={{ backgroundColor }}>
				<Tabs
					screenOptions={{ headerShown: false }}
					tabBar={(props) => <CustomTabBar {...props} />}
				>
					<Tabs.Screen name="index" options={{ title: t('tabs.workspace') }} />
					<Tabs.Screen
						name="settings"
						options={{ title: t('tabs.settings') }}
					/>
				</Tabs>
				{workspaceOverlayActive ? null : (
					<>
						<AppEdgeFade
							backgroundColor={backgroundColor}
							height={insets.top + FADE_EXTRA_TOP}
							position="top"
						/>
						<AppEdgeFade
							backgroundColor={backgroundColor}
							height={insets.bottom + FADE_EXTRA_BOTTOM}
							position="bottom"
						/>
					</>
				)}
			</View>
		</MarkdownToolbarProvider>
	);
}
