import { Tabs } from 'expo-router';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import { useTranslation } from 'react-i18next';
import { MarkdownToolbarProvider } from '@/features/editor';
import {
	APP_THEME_BACKGROUND_COLORS,
	useResolvedThemePreference,
} from '@/features/settings';
import CustomTabBar from './custom-tab-bar';

const FADE_EXTRA_TOP = 6;
const FADE_EXTRA_BOTTOM = 18;

export default function AppTabs() {
	const { t } = useTranslation();
	const insets = useSafeAreaInsets();
	const resolvedTheme = useResolvedThemePreference();
	const backgroundColor = APP_THEME_BACKGROUND_COLORS[resolvedTheme];

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
			</View>
		</MarkdownToolbarProvider>
	);
}

function AppEdgeFade({
	backgroundColor,
	height,
	position,
}: {
	backgroundColor: string;
	height: number;
	position: 'top' | 'bottom';
}) {
	const isTop = position === 'top';

	return (
		<View
			pointerEvents="none"
			className={`absolute left-0 right-0 z-10 ${isTop ? 'top-0' : 'bottom-0'}`}
			style={{ height }}
		>
			<Svg
				height={height}
				width="100%"
				viewBox={`0 0 100 ${height}`}
				preserveAspectRatio="none"
			>
				<Defs>
					<LinearGradient
						id={`app-${position}-fade`}
						x1="0"
						x2="0"
						y1={isTop ? '0' : '1'}
						y2={isTop ? '1' : '0'}
					>
						<Stop offset="0" stopColor={backgroundColor} stopOpacity="0.95" />
						<Stop offset="0.3" stopColor={backgroundColor} stopOpacity="0.75" />
						<Stop offset="0.6" stopColor={backgroundColor} stopOpacity="0.4" />
						<Stop
							offset="0.85"
							stopColor={backgroundColor}
							stopOpacity="0.12"
						/>
						<Stop offset="1" stopColor={backgroundColor} stopOpacity="0" />
					</LinearGradient>
				</Defs>
				<Rect fill={`url(#app-${position}-fade)`} height={height} width="100" />
			</Svg>
		</View>
	);
}
