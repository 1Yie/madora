import { Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Constants from 'expo-constants';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import type { ComponentType, ReactNode } from 'react';
import {
	ArrowLeft,
	Check,
	ChevronRight,
	Cloud,
	Info,
	Moon,
	Palette,
	PenLine,
	Smartphone,
	Sparkles,
	Sun,
} from 'lucide-react-native';

import {
	Slider,
	SliderFilledTrack,
	SliderThumb,
	SliderTrack,
} from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { useAiSettings } from '@/features/ai';
import {
	APP_THEME_BACKGROUND_COLORS,
	DEFAULT_EDITOR_FONT_SIZE,
	MAX_EDITOR_FONT_SIZE,
	MIN_EDITOR_FONT_SIZE,
	getLocalePreferenceOptions,
	useAppSettings,
	useAppThemePalette,
	useResolvedThemePreference,
	type AppThemePalette,
	type LocalePreference,
	type ThemePreference,
} from '../providers/app-settings-provider';

type SettingsSection = 'editor' | 'appearance' | 'about';
type SettingsHomeSection = SettingsSection | 'ai' | 'sync';
type SettingsIcon = ComponentType<{
	color?: string;
	size?: number;
	strokeWidth?: number;
}>;

const SETTINGS_SECTIONS: {
	detailKey: string;
	icon: SettingsIcon;
	key: SettingsHomeSection;
	route:
		| '/settings/editor'
		| '/settings/appearance'
		| '/settings/ai'
		| '/settings/sync'
		| '/settings/about';
	titleKey: string;
}[] = [
	{
		detailKey: 'settings.sections.appearance.description',
		icon: Palette,
		key: 'appearance',
		route: '/settings/appearance',
		titleKey: 'settings.sections.appearance.label',
	},
	{
		detailKey: 'settings.sections.editor.description',
		icon: PenLine,
		key: 'editor',
		route: '/settings/editor',
		titleKey: 'settings.sections.editor.label',
	},
	{
		detailKey: 'settings.sections.ai.description',
		icon: Sparkles,
		key: 'ai',
		route: '/settings/ai',
		titleKey: 'settings.sections.ai.label',
	},
	{
		detailKey: 'settings.sections.sync.description',
		icon: Cloud,
		key: 'sync',
		route: '/settings/sync',
		titleKey: 'settings.sections.sync.label',
	},
	{
		detailKey: 'settings.sections.about.description',
		icon: Info,
		key: 'about',
		route: '/settings/about',
		titleKey: 'settings.sections.about.label',
	},
];

const THEME_OPTIONS: {
	icon: SettingsIcon;
	labelKey: string;
	value: ThemePreference;
}[] = [
	{
		icon: Smartphone,
		labelKey: 'settings.appearance.theme.system.label',
		value: 'system',
	},
	{
		icon: Sun,
		labelKey: 'settings.appearance.theme.light.label',
		value: 'light',
	},
	{
		icon: Moon,
		labelKey: 'settings.appearance.theme.dark.label',
		value: 'dark',
	},
];

export function SettingsHomeScreen() {
	const { t } = useTranslation();
	const palette = useAppThemePalette();

	return (
		<SettingsShell>
			<SettingsHeader
				detail={t('settings.mobileHome.description')}
				eyebrow={t('tabs.settings')}
				title={t('tabs.settings')}
			/>

			<View className="gap-2">
				{SETTINGS_SECTIONS.map((item) => (
					<SettingsRow
						key={item.key}
						detail={t(item.detailKey)}
						icon={item.icon}
						onPress={() => router.push(item.route)}
						palette={palette}
						title={t(item.titleKey)}
					/>
				))}
			</View>
		</SettingsShell>
	);
}

export function SettingsDetailScreen({
	section,
}: {
	section: SettingsSection;
}) {
	if (section === 'appearance') {
		return <AppearanceSettingsScreen />;
	}
	if (section === 'editor') {
		return <EditorSettingsScreen />;
	}
	return <AboutSettingsScreen />;
}

function AppearanceSettingsScreen() {
	const { t } = useTranslation();
	const palette = useAppThemePalette();
	const {
		editorFontSize,
		localePreference,
		setEditorFontSize,
		setLocalePreference,
		setThemePreference,
		themePreference,
	} = useAppSettings();

	return (
		<SettingsShell header={<BackButton />}>
			<SettingsHeader
				detail={t('settings.mobileHome.detail.appearance')}
				eyebrow={t('settings.sections.appearance.label')}
				title={t('settings.sections.appearance.description')}
			/>

			<SettingsCard
				detail={t('settings.appearance.cards.language.description')}
				title={t('settings.appearance.cards.language.title')}
			>
				<View className="flex-row flex-wrap gap-2">
					{getLocalePreferenceOptions().map((locale) => (
						<OptionChip
							key={locale}
							active={localePreference === locale}
							label={getLocaleLabel(t, locale)}
							onPress={() => setLocalePreference(locale)}
							palette={palette}
						/>
					))}
				</View>
			</SettingsCard>

			<SettingsCard title={t('settings.appearance.cards.theme.title')}>
				<View className="gap-2">
					{THEME_OPTIONS.map((option) => (
						<OptionRow
							key={option.value}
							active={themePreference === option.value}
							icon={option.icon}
							label={t(option.labelKey)}
							onPress={() => setThemePreference(option.value)}
							palette={palette}
						/>
					))}
				</View>
			</SettingsCard>

			<SettingsCard
				detail={t('settings.appearance.editorTextSize.description')}
				title={t('settings.appearance.editorTextSize.label')}
			>
				<View className="gap-3">
					<View className="flex-row items-center justify-between gap-3">
						<Text
							className="font-mono text-[18px] font-semibold text-foreground"
						>
							{editorFontSize}px
						</Text>
						<Pressable
							onPress={() => setEditorFontSize(DEFAULT_EDITOR_FONT_SIZE)}
							className="rounded-full bg-secondary px-3 py-2"
						>
							<Text className="text-[12px] font-semibold text-foreground">
								{t('settings.appearance.editorTextSize.reset')}
							</Text>
						</Pressable>
					</View>
					<Slider
						className="py-1"
						maxValue={MAX_EDITOR_FONT_SIZE}
						minValue={MIN_EDITOR_FONT_SIZE}
						onChange={(value) => setEditorFontSize(Math.round(value))}
						step={1}
						thumbSize={18}
						value={editorFontSize}
					>
						<SliderTrack className="h-1.5 rounded-full bg-secondary">
							<SliderFilledTrack className="rounded-full bg-foreground" />
						</SliderTrack>
						<SliderThumb
							className="h-[18px] w-[18px] border-2 border-background
								bg-foreground shadow-none"
						/>
					</Slider>
					<View className="flex-row items-center justify-between">
						<Text className="text-[12px] text-muted-foreground">
							{MIN_EDITOR_FONT_SIZE}px
						</Text>
						<Text className="text-[12px] text-muted-foreground">
							{MAX_EDITOR_FONT_SIZE}px
						</Text>
					</View>
				</View>
			</SettingsCard>
		</SettingsShell>
	);
}

function EditorSettingsScreen() {
	const { t } = useTranslation();
	const aiSettings = useAiSettings();
	const { saveMode, setSaveMode } = useAppSettings();

	return (
		<SettingsShell header={<BackButton />}>
			<SettingsHeader
				detail={t('settings.mobileHome.detail.editor')}
				eyebrow={t('settings.sections.editor.label')}
				title={t('settings.sections.editor.description')}
			/>

			<SettingsCard title={t('settings.editor.cards.input.title')}>
				<SettingSwitchRow
					description={t('settings.editor.rows.autoSave.description')}
					onValueChange={(enabled) => setSaveMode(enabled ? 'auto' : 'manual')}
					title={t('settings.editor.rows.autoSave.title')}
					value={saveMode === 'auto'}
				/>
				<View className="mt-3 h-px bg-border" />
				<SettingSwitchRow
					description={t('settings.editor.rows.enableAi.description')}
					onValueChange={aiSettings.setEnabled}
					title={t('settings.editor.rows.enableAi.title')}
					value={aiSettings.enabled}
				/>
			</SettingsCard>
		</SettingsShell>
	);
}

function AboutSettingsScreen() {
	const { t } = useTranslation();
	const appVersion = Constants.expoConfig?.version ?? '1.0.0';

	return (
		<SettingsShell header={<BackButton />}>
			<SettingsHeader
				detail={t('settings.mobileHome.detail.about')}
				eyebrow={t('settings.sections.about.label')}
				title={t('settings.sections.about.description')}
			/>

			<SettingsCard title="Madora Mobile">
				<SettingsInfoRow
					detail={t('settings.about.currentVersionDescription', {
						version: appVersion,
					})}
					title={t('settings.about.stats.version')}
				/>
				<SettingsInfoRow
					detail={t('settings.about.cards.update.description')}
					title={t('settings.about.cards.update.title')}
				/>
				<SettingsInfoRow
					detail={t('settings.about.cards.licenses.description')}
					title={t('settings.about.cards.licenses.title')}
				/>
			</SettingsCard>
		</SettingsShell>
	);
}

export function SettingsBackButton() {
	const insets = useSafeAreaInsets();

	return (
		<View
			pointerEvents="box-none"
			className="absolute left-4 z-10"
			style={{ top: insets.top + 12 }}
		>
			<BackButton />
		</View>
	);
}

function SettingsShell({
	children,
	header,
}: {
	children: ReactNode;
	header?: ReactNode;
}) {
	const insets = useSafeAreaInsets();
	const resolvedTheme = useResolvedThemePreference();

	return (
		<View
			style={{
				flex: 1,
				backgroundColor: APP_THEME_BACKGROUND_COLORS[resolvedTheme],
			}}
		>
			{header ? (
				<View
					pointerEvents="box-none"
					className="absolute left-4 z-10"
					style={{ top: insets.top + 12 }}
				>
					{header}
				</View>
			) : null}
			<KeyboardAwareScrollView
				bottomOffset={24}
				keyboardDismissMode="interactive"
				keyboardShouldPersistTaps="handled"
				style={{ flex: 1 }}
				contentContainerStyle={{
					gap: 16,
					paddingBottom: insets.bottom + 120,
					paddingHorizontal: 16,
					paddingTop: insets.top + (header ? 64 : 12),
				}}
			>
				{children}
			</KeyboardAwareScrollView>
		</View>
	);
}

function SettingsHeader({
	detail,
	eyebrow,
	title,
}: {
	detail: string;
	eyebrow: string;
	title: string;
}) {
	return (
		<View className="gap-1">
			<Text
				className="text-[12px] font-semibold uppercase text-muted-foreground"
			>
				{eyebrow}
			</Text>
			<Text className="text-[24px] font-semibold text-foreground">{title}</Text>
			<Text className="text-[13px] leading-5 text-muted-foreground">
				{detail}
			</Text>
		</View>
	);
}

function BackButton() {
	const { t } = useTranslation();
	const palette = useAppThemePalette();

	return (
		<Pressable
			onPress={() => router.back()}
			className="h-9 flex-row items-center gap-1.5 self-start rounded-full px-4"
			style={{ backgroundColor: palette.surfaceMuted }}
		>
			<ArrowLeft color={palette.icon} size={16} strokeWidth={2.2} />
			<Text className="text-[13px] font-semibold text-foreground">
				{t('common.actions.back')}
			</Text>
		</Pressable>
	);
}

function SettingsCard({
	children,
	detail,
	title,
}: {
	children: ReactNode;
	detail?: string;
	title: string;
}) {
	return (
		<ThemedSurfaceCard>
			{title || detail ? (
				<View className="gap-1">
					<Text className="text-[16px] font-semibold text-foreground">
						{title}
					</Text>
					{detail ? (
						<Text className="text-[13px] leading-5 text-muted-foreground">
							{detail}
						</Text>
					) : null}
				</View>
			) : null}
			{children}
		</ThemedSurfaceCard>
	);
}

function ThemedSurfaceCard({ children }: { children: ReactNode }) {
	const palette = useAppThemePalette();

	return (
		<View
			className="gap-3 rounded-lg p-4"
			style={{
				backgroundColor: palette.surface,
				borderColor: palette.border,
				borderWidth: 1,
			}}
		>
			{children}
		</View>
	);
}

function SettingsRow({
	detail,
	icon: Icon,
	onPress,
	palette,
	title,
}: {
	detail: string;
	icon: SettingsIcon;
	onPress: () => void;
	palette: AppThemePalette;
	title: string;
}) {
	return (
		<Pressable
			onPress={onPress}
			className="min-h-[72px] flex-row items-center rounded-lg px-4 py-3"
			style={{
				backgroundColor: palette.surface,
				borderColor: palette.border,
				borderWidth: 1,
			}}
		>
			<View
				className="mr-3 h-10 w-10 items-center justify-center rounded-full"
				style={{ backgroundColor: palette.surfaceMuted }}
			>
				<Icon color={palette.icon} size={18} strokeWidth={2.1} />
			</View>
			<View className="flex-1 gap-1 pr-3">
				<Text className="text-[16px] font-semibold text-foreground">
					{title}
				</Text>
				<Text className="text-[13px] leading-5 text-muted-foreground">
					{detail}
				</Text>
			</View>
			<ChevronRight color={palette.iconMuted} size={18} strokeWidth={2.2} />
		</Pressable>
	);
}

function SettingSwitchRow({
	description,
	onValueChange,
	title,
	value,
}: {
	description: string;
	onValueChange: (value: boolean) => void;
	title: string;
	value: boolean;
}) {
	return (
		<View className="flex-row items-center justify-between gap-4">
			<View className="flex-1 gap-1">
				<Text className="text-[15px] font-semibold text-foreground">
					{title}
				</Text>
				<Text className="text-[13px] leading-5 text-muted-foreground">
					{description}
				</Text>
			</View>
			<Switch value={value} onValueChange={onValueChange} />
		</View>
	);
}

function OptionChip({
	active,
	label,
	onPress,
	palette,
}: {
	active: boolean;
	label: string;
	onPress: () => void;
	palette: AppThemePalette;
}) {
	return (
		<Pressable
			onPress={onPress}
			className="flex-row items-center gap-1.5 rounded-full border px-3 py-2"
			style={{
				backgroundColor: active ? palette.accentSurface : palette.surfaceMuted,
				borderColor: active ? palette.accentSurface : palette.border,
			}}
		>
			{active ? (
				<Check color={palette.accentForeground} size={13} strokeWidth={2.4} />
			) : null}
			<Text
				className="text-[13px] font-medium"
				style={{
					color: active ? palette.accentForeground : palette.foreground,
				}}
			>
				{label}
			</Text>
		</Pressable>
	);
}

function OptionRow({
	active,
	icon: Icon,
	label,
	onPress,
	palette,
}: {
	active: boolean;
	icon: SettingsIcon;
	label: string;
	onPress: () => void;
	palette: AppThemePalette;
}) {
	return (
		<Pressable
			onPress={onPress}
			className="min-h-11 flex-row items-center gap-3 rounded-md border px-3"
			style={{
				backgroundColor: active ? palette.accentSurface : palette.surfaceMuted,
				borderColor: active ? palette.accentSurface : palette.border,
			}}
		>
			<Icon
				color={active ? palette.accentForeground : palette.icon}
				size={16}
				strokeWidth={2.2}
			/>
			<Text
				className="flex-1 text-[14px] font-semibold"
				style={{
					color: active ? palette.accentForeground : palette.foreground,
				}}
			>
				{label}
			</Text>
			{active ? (
				<Check color={palette.accentForeground} size={15} strokeWidth={2.4} />
			) : null}
		</Pressable>
	);
}

function SettingsInfoRow({ detail, title }: { detail: string; title: string }) {
	return (
		<View
			className="gap-1 border-t border-border pt-3 first:border-t-0 first:pt-0"
		>
			<Text className="text-[15px] font-semibold text-foreground">{title}</Text>
			<Text className="text-[13px] leading-5 text-muted-foreground">
				{detail}
			</Text>
		</View>
	);
}

function getLocaleLabel(
	t: ReturnType<typeof useTranslation>['t'],
	locale: LocalePreference
) {
	if (locale === 'zh-CN') return t('language.options.zhCN');
	return t(`language.options.${locale}`);
}
