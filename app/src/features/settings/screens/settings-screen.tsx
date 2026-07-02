import { Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Constants from 'expo-constants';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import type { ComponentType, ReactNode } from 'react';
import {
	ArrowLeft,
	ChevronRight,
	Cloud,
	Info,
	Palette,
	PenLine,
	Sparkles,
} from 'lucide-react-native';

type SettingsSection = 'editor' | 'appearance' | 'about';
type SettingsHomeSection = SettingsSection | 'ai' | 'sync';
type SettingsIcon = ComponentType<{
	color?: string;
	size?: number;
	strokeWidth?: number;
}>;

const SETTINGS_SECTIONS: {
	icon: SettingsIcon;
	key: SettingsHomeSection;
	route:
		| '/settings/editor'
		| '/settings/appearance'
		| '/settings/ai'
		| '/settings/sync'
		| '/settings/about';
	titleKey: string;
	detailKey: string;
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
		detailKey: 'settings.editor.providerHint',
		icon: Sparkles,
		key: 'ai',
		route: '/settings/ai',
		titleKey: 'settings.editor.cards.ai.title',
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

const DETAIL_ITEMS: Record<
	SettingsSection,
	{ detailKey: string; titleKey: string; valueKey?: string }[]
> = {
	editor: [
		{
			detailKey: 'settings.editor.rows.autoSave.description',
			titleKey: 'settings.editor.rows.autoSave.title',
		},
		{
			detailKey: 'settings.editor.rows.enableAi.description',
			titleKey: 'settings.editor.rows.enableAi.title',
		},
		{
			detailKey: 'settings.editor.closeBehavior.minimize.description',
			titleKey: 'settings.editor.cards.window.title',
		},
	],
	appearance: [
		{
			detailKey: 'settings.appearance.cards.language.description',
			titleKey: 'settings.appearance.cards.language.title',
		},
		{
			detailKey: 'settings.appearance.tabBar.scroll.description',
			titleKey: 'settings.appearance.cards.tabs.title',
		},
		{
			detailKey: 'settings.appearance.theme.system.description',
			titleKey: 'settings.appearance.cards.theme.title',
			valueKey: 'settings.appearance.theme.system.label',
		},
		{
			detailKey: 'settings.appearance.editorTextSize.description',
			titleKey: 'settings.appearance.cards.editor.title',
		},
		{
			detailKey: 'settings.appearance.accentOptions.description',
			titleKey: 'settings.appearance.cards.accent.title',
		},
	],
	about: [
		{
			detailKey: 'settings.about.currentVersionDescription',
			titleKey: 'settings.about.stats.version',
		},
		{
			detailKey: 'settings.about.cards.update.description',
			titleKey: 'settings.about.cards.update.title',
		},
		{
			detailKey: 'settings.about.cards.licenses.description',
			titleKey: 'settings.about.cards.licenses.title',
		},
	],
};

export function SettingsHomeScreen() {
	const { t } = useTranslation();

	return (
		<SettingsShell>
			<View className="gap-1">
				<Text
					className="text-[12px] font-semibold uppercase text-muted-foreground"
				>
					{t('tabs.settings')}
				</Text>
				<Text className="text-[24px] font-semibold text-foreground">
					{t('tabs.settings')}
				</Text>
				<Text className="text-[13px] leading-5 text-muted-foreground">
					{t('settings.mobileHome.description')}
				</Text>
			</View>

			<View className="gap-2">
				{SETTINGS_SECTIONS.map((item) => (
					<SettingsRow
						key={item.key}
						detail={t(item.detailKey)}
						icon={item.icon}
						onPress={() => router.push(item.route)}
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
	const { t } = useTranslation();
	const items = DETAIL_ITEMS[section];
	const appVersion = Constants.expoConfig?.version ?? '1.0.0';

	return (
		<SettingsShell header={<BackButton />}>
			<View className="gap-1">
				<Text
					className="text-[12px] font-semibold uppercase text-muted-foreground"
				>
					{t(`settings.sections.${section}.label`)}
				</Text>
				<Text className="text-[24px] font-semibold text-foreground">
					{t(`settings.sections.${section}.description`)}
				</Text>
				<Text className="text-[13px] leading-5 text-muted-foreground">
					{t(`settings.mobileHome.detail.${section}`)}
				</Text>
			</View>

			<View className="gap-2">
				{items.map((item) => (
					<SettingsInfoRow
						key={item.titleKey}
						detail={t(item.detailKey, { version: appVersion })}
						title={t(item.titleKey)}
						value={item.valueKey ? t(item.valueKey) : undefined}
					/>
				))}
			</View>
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

	return (
		<View style={{ flex: 1, backgroundColor: '#fbfcff' }}>
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
				style={{ flex: 1 }}
				keyboardDismissMode="interactive"
				keyboardShouldPersistTaps="handled"
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

function BackButton() {
	const { t } = useTranslation();

	return (
		<Pressable
			onPress={() => router.back()}
			className="h-9 flex-row items-center gap-1.5 self-start rounded-full
				bg-secondary px-4"
		>
			<ArrowLeft color="#111827" size={16} strokeWidth={2.2} />
			<Text className="text-[13px] font-semibold text-foreground">
				{t('common.actions.back')}
			</Text>
		</Pressable>
	);
}

function SettingsRow({
	detail,
	icon: Icon,
	onPress,
	title,
}: {
	detail: string;
	icon: SettingsIcon;
	onPress: () => void;
	title: string;
}) {
	return (
		<Pressable
			onPress={onPress}
			className="min-h-[72px] flex-row items-center rounded-lg border
				border-border bg-background px-4 py-3"
		>
			<View
				className="mr-3 h-10 w-10 items-center justify-center rounded-full
					bg-secondary"
			>
				<Icon color="#111827" size={18} strokeWidth={2.1} />
			</View>
			<View className="flex-1 gap-1 pr-3">
				<Text className="text-[16px] font-semibold text-foreground">
					{title}
				</Text>
				<Text className="text-[13px] leading-5 text-muted-foreground">
					{detail}
				</Text>
			</View>
			<ChevronRight color="#6b7280" size={18} strokeWidth={2.2} />
		</Pressable>
	);
}

function SettingsInfoRow({
	detail,
	title,
	value,
}: {
	detail: string;
	title: string;
	value?: string;
}) {
	return (
		<View
			className="min-h-[72px] flex-row items-center rounded-lg border
				border-border bg-background px-4 py-3"
		>
			<View className="flex-1 gap-1 pr-3">
				<Text className="text-[16px] font-semibold text-foreground">
					{title}
				</Text>
				<Text className="text-[13px] leading-5 text-muted-foreground">
					{detail}
				</Text>
			</View>
			{value ? (
				<Text className="text-[13px] font-semibold text-muted-foreground">
					{value}
				</Text>
			) : null}
		</View>
	);
}
