import { DarkTheme, DefaultTheme, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect, type ReactNode } from 'react';
import { StatusBar, View, useColorScheme } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { KeyboardProvider } from 'react-native-keyboard-controller';

import { GluestackUIProvider } from '../components/ui/gluestack-ui-provider';
import { useErrorToast } from '@/components/ui/toast';
import { KeyboardDismissView } from '@/components/ui/keyboard-dismiss-view';
import { NativeToastProvider } from '@/components/ui/native-toast';
import { AppTabs } from '@/app-shell';
import { AiSettingsProvider } from '@/features/ai';
import { EditorProvider } from '@/features/editor';
import { MadoraSyncProvider } from '@/features/madora-sync';
import { OnboardingScreen } from '@/features/onboarding';
import {
	AppSettingsProvider,
	APP_THEME_BACKGROUND_COLORS,
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
								<AppContentGate>
									<EditorProvider>
										<AppTabs />
									</EditorProvider>
								</AppContentGate>
							</MadoraSyncProvider>
						</AiSettingsProvider>
					</ThemedAppProviders>
				</AppSettingsProvider>
			</KeyboardProvider>
		</GestureHandlerRootView>
	);
}

/**
 * Surfaces unhandled promise rejections (e.g. native WebSocket handshake
 * timeouts, SQLite errors) as a top toast instead of leaving them only in the
 * console as "Uncaught (in promise)". Wraps the existing global handler so
 * default RN behaviour (LogBox reporting) is preserved.
 */
function GlobalErrorHandler() {
	const showErrorToast = useErrorToast();

	useEffect(() => {
		const ErrorUtils = globalThis as unknown as {
			ErrorUtils?: {
				getGlobalHandler?: () => (error: unknown, isFatal?: boolean) => void;
				setGlobalHandler?: (
					handler: (error: unknown, isFatal?: boolean) => void
				) => void;
			};
		};

		const previousHandler =
			ErrorUtils.ErrorUtils?.getGlobalHandler?.() ?? (() => {});

		const handler = (error: unknown, isFatal?: boolean) => {
			previousHandler(error, isFatal);

			const message =
				typeof error === 'string'
					? error
					: error instanceof Error
						? error.message
						: null;
			if (message) showErrorToast(message);
		};

		ErrorUtils.ErrorUtils?.setGlobalHandler?.(handler);
		return () => {
			ErrorUtils.ErrorUtils?.setGlobalHandler?.(previousHandler);
		};
	}, [showErrorToast]);

	return null;
}

function ThemedAppProviders({ children }: { children: ReactNode }) {
	const systemColorScheme = useColorScheme();
	const { themePreference } = useAppSettings();
	const effectiveColorScheme = resolveThemePreference(
		themePreference,
		systemColorScheme
	);

	return (
		<GluestackUIProvider mode={themePreference}>
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
				<NativeToastProvider>
					<GlobalErrorHandler />
					<KeyboardDismissView style={{ flex: 1 }}>
						{children}
					</KeyboardDismissView>
				</NativeToastProvider>
			</ThemeProvider>
		</GluestackUIProvider>
	);
}

function AppContentGate({ children }: { children: ReactNode }) {
	const systemColorScheme = useColorScheme();
	const {
		completeOnboarding,
		onboardingComplete,
		settingsHydrated,
		themePreference,
	} = useAppSettings();
	const effectiveColorScheme = resolveThemePreference(
		themePreference,
		systemColorScheme
	);
	const backgroundColor = APP_THEME_BACKGROUND_COLORS[effectiveColorScheme];

	if (!settingsHydrated) {
		return <View style={{ flex: 1, backgroundColor }} />;
	}

	if (!onboardingComplete) {
		return <OnboardingScreen onComplete={completeOnboarding} />;
	}

	return <>{children}</>;
}
