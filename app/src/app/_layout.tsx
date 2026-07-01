import { DarkTheme, DefaultTheme, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { StatusBar, useColorScheme } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { KeyboardProvider } from 'react-native-keyboard-controller';

import AppTabs from '../components/app-tabs';
import { GluestackUIProvider } from '../components/ui/gluestack-ui-provider';
import { AiSettingsProvider } from '../features/ai/settings-provider';
import { MadoraSyncProvider } from '../features/madora-sync/provider';
import '@/i18n';
import '../global.css';

void SplashScreen.preventAutoHideAsync();

export default function TabLayout() {
	const colorScheme = useColorScheme();
	const providerMode =
		colorScheme === 'dark' || colorScheme === 'light' ? colorScheme : 'system';

	useEffect(() => {
		StatusBar.setTranslucent(true);
		StatusBar.setBackgroundColor('transparent', true);
		void SplashScreen.hideAsync();
	}, []);

	return (
		<GestureHandlerRootView style={{ flex: 1 }}>
			<KeyboardProvider statusBarTranslucent>
				<GluestackUIProvider mode={providerMode}>
					<StatusBar
						animated
						backgroundColor="transparent"
						barStyle={colorScheme === 'dark' ? 'light-content' : 'dark-content'}
						translucent
					/>
					<ThemeProvider
						value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}
					>
						<AiSettingsProvider>
							<MadoraSyncProvider>
								<AppTabs />
							</MadoraSyncProvider>
						</AiSettingsProvider>
					</ThemeProvider>
				</GluestackUIProvider>
			</KeyboardProvider>
		</GestureHandlerRootView>
	);
}
