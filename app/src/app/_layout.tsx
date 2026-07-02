import { DarkTheme, DefaultTheme, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect, type ReactNode } from 'react';
import { StatusBar, useColorScheme } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { KeyboardProvider } from 'react-native-keyboard-controller';

import { GluestackUIProvider } from '../components/ui/gluestack-ui-provider';
import { AppTabs } from '@/app-shell';
import { AiSettingsProvider } from '@/features/ai';
import { EditorProvider } from '@/features/editor';
import { MadoraSyncProvider } from '@/features/madora-sync';
import {
	AppSettingsProvider,
	resolveThemePreference,
	useAppSettings,
} from '@/features/settings';
import '@/i18n';
import '../global.css';

void SplashScreen.preventAutoHideAsync();

export default function TabLayout() {
	useEffect(() => {
		StatusBar.setBackgroundColor('transparent', true);
		void SplashScreen.hideAsync();
	}, []);

	return (
		<GestureHandlerRootView style={{ flex: 1 }}>
			<KeyboardProvider>
				<AppSettingsProvider>
					<ThemedAppProviders>
						<AiSettingsProvider>
							<MadoraSyncProvider>
								<EditorProvider>
									<AppTabs />
								</EditorProvider>
							</MadoraSyncProvider>
						</AiSettingsProvider>
					</ThemedAppProviders>
				</AppSettingsProvider>
			</KeyboardProvider>
		</GestureHandlerRootView>
	);
}

function ThemedAppProviders({ children }: { children: ReactNode }) {
	const systemColorScheme = useColorScheme();
	const { themePreference } = useAppSettings();
	const effectiveColorScheme = resolveThemePreference(
		themePreference,
		systemColorScheme
	);

	return (
		<GluestackUIProvider mode={effectiveColorScheme}>
			<StatusBar
				animated
				backgroundColor="transparent"
				barStyle={
					effectiveColorScheme === 'dark' ? 'light-content' : 'dark-content'
				}
			/>
			<ThemeProvider
				value={effectiveColorScheme === 'dark' ? DarkTheme : DefaultTheme}
			>
				{children}
			</ThemeProvider>
		</GluestackUIProvider>
	);
}
