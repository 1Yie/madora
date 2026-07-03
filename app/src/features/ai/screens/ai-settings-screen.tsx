import { useCallback, useMemo, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import {
	Modal,
	Pressable,
	ScrollView,
	StyleSheet,
	Text,
	TextInput,
	useWindowDimensions,
	View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import {
	Check,
	ChevronDown,
	KeyRound,
	Lock,
	Server,
	Sparkles,
} from 'lucide-react-native';

import modelsByProvider from '@/assets/models.json';
import { Switch } from '@/components/ui/switch';
import {
	APP_THEME_BACKGROUND_COLORS,
	SettingsCard,
	useAppThemePalette,
	useResolvedThemePreference,
	type AppThemePalette,
} from '@/features/settings';
import { BackButton } from '@/shared/components';
import { ProviderGlyph } from '../components/provider-glyph';
import { getProviderDefinitions } from '../lib/provider-definitions';
import { useAiSettings } from '../providers/settings-provider';
import type { AiProvider, CustomProviderProtocol } from '../types';

const CUSTOM_PROTOCOLS: CustomProviderProtocol[] = [
	'openai',
	'anthropic',
	'google',
];
const MODEL_DROPDOWN_GAP = 2;
const MODEL_DROPDOWN_MAX_HEIGHT = 280;
const MODEL_DROPDOWN_ROW_HEIGHT = 44;
const FLOATING_TAB_BAR_CLEARANCE = 88;

type ProviderModelOption = {
	name: string;
	value: string;
};

export function AiSettingsScreen({ onBack }: { onBack?: () => void }) {
	const { t } = useTranslation();
	const insets = useSafeAreaInsets();
	const resolvedTheme = useResolvedThemePreference();
	const palette = useAppThemePalette();
	const settings = useAiSettings();
	const providers = useMemo(() => getProviderDefinitions(), []);
	const selectedProvider = providers.find(
		(provider) => provider.key === settings.provider
	);
	const isCustomProvider = settings.provider === 'custom';
	const modelOptions =
		(modelsByProvider as Partial<Record<AiProvider, ProviderModelOption[]>>)[
			settings.provider
		] ?? [];
	const selectedModelLabel =
		modelOptions.find((option) => option.value === settings.model)?.name ??
		settings.model;
	const [apiKeyDraft, setApiKeyDraft] = useState('');
	const [message, setMessage] = useState<string | null>(null);

	const saveApiKey = async () => {
		setMessage(null);
		try {
			await settings.saveApiKey(apiKeyDraft);
			setApiKeyDraft('');
			setMessage(t('settings.editor.toasts.apiKeySaved'));
		} catch (error) {
			setMessage(error instanceof Error ? error.message : String(error));
		}
	};

	const deleteApiKey = async () => {
		setMessage(null);
		await settings.deleteApiKey();
		setApiKeyDraft('');
		setMessage(t('settings.editor.toasts.apiKeyDeleted'));
	};

	return (
		<View
			style={{
				flex: 1,
				backgroundColor: APP_THEME_BACKGROUND_COLORS[resolvedTheme],
			}}
		>
			{onBack ? (
				<View
					pointerEvents="box-none"
					className="absolute left-4 z-10"
					style={{ top: insets.top + 12 }}
				>
					<BackButton onPress={onBack} />
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
					paddingTop: insets.top + (onBack ? 64 : 12),
				}}
			>
				<Text className="text-[24px] font-semibold text-foreground">
					{t('settings.editor.cards.ai.title')}
				</Text>

				<SettingsCard>
					<View className="flex-row items-center justify-between gap-4">
						<View className="flex-1 flex-row items-start gap-3">
							<View
								className="mt-0.5 h-9 w-9 items-center justify-center
									rounded-full"
								style={{ backgroundColor: palette.surfaceMuted }}
							>
								<Sparkles color={palette.icon} size={17} strokeWidth={2.2} />
							</View>
							<View className="flex-1 gap-1">
								<Text className="text-[16px] font-semibold text-foreground">
									{t('settings.editor.rows.enableAi.title')}
								</Text>
								<Text className="text-[13px] leading-5 text-muted-foreground">
									{t('settings.editor.rows.enableAi.description')}
								</Text>
							</View>
						</View>
						<Switch
							value={settings.enabled}
							onValueChange={settings.setEnabled}
						/>
					</View>
				</SettingsCard>

				<SettingsCard title={t('common.labels.provider')}>
					<View className="gap-2">
						{providers.map((provider) => (
							<ProviderOption
								key={provider.key}
								active={settings.provider === provider.key}
								label={provider.label}
								provider={provider.key}
								onPress={() => settings.setProvider(provider.key)}
							/>
						))}
					</View>
				</SettingsCard>

				{isCustomProvider ? (
					<SettingsCard title={t('settings.editor.customConfigTitle')}>
						<View className="gap-3">
							<View className="flex-row flex-wrap gap-2">
								{CUSTOM_PROTOCOLS.map((protocol) => (
									<ProtocolChip
										key={protocol}
										active={settings.customProtocol === protocol}
										label={t(
											`settings.editor.customProtocolOptions.${protocol}.label`
										)}
										onPress={() => settings.setCustomProtocol(protocol)}
									/>
								))}
							</View>

							<FieldLabel
								icon={
									<Server
										color={palette.iconMuted}
										size={15}
										strokeWidth={2.1}
									/>
								}
								label={t('common.labels.apiUrl')}
							/>
							<TextInput
								autoCapitalize="none"
								autoCorrect={false}
								className="min-h-11 rounded-md border border-border bg-secondary
									px-3 text-[14px] text-foreground"
								onChangeText={settings.setApiUrl}
								placeholder="https://api.example.com"
								value={settings.apiUrl}
							/>

							<View className="flex-row items-center justify-between gap-4 pt-1">
								<View className="flex-1 gap-1">
									<FieldLabel
										icon={
											<Lock
												color={palette.iconMuted}
												size={15}
												strokeWidth={2.1}
											/>
										}
										label={t('common.labels.https')}
									/>
									<Text className="text-[12px] leading-5 text-muted-foreground">
										{t('settings.editor.httpsHint')}
									</Text>
								</View>
								<Switch
									value={settings.useSsl}
									onValueChange={settings.setUseSsl}
								/>
							</View>
						</View>
					</SettingsCard>
				) : null}

				<SettingsCard title={t('common.labels.model')}>
					{isCustomProvider || modelOptions.length === 0 ? (
						<TextInput
							autoCapitalize="none"
							autoCorrect={false}
							className="min-h-11 rounded-md border border-border bg-secondary
								px-3 text-[14px] text-foreground"
							onChangeText={settings.setModel}
							placeholder={selectedProvider?.defaultModel || 'model-name'}
							value={settings.model}
						/>
					) : (
						<ModelDropdown
							modelOptions={modelOptions}
							onSelect={settings.setModel}
							palette={palette}
							placeholder={t('settings.editor.modelPlaceholder')}
							selectedLabel={selectedModelLabel}
							selectedValue={settings.model}
						/>
					)}
				</SettingsCard>

				<SettingsCard title={t('common.labels.apiKey')}>
					<FieldLabel
						icon={
							<KeyRound color={palette.iconMuted} size={15} strokeWidth={2.1} />
						}
						label={
							settings.hasApiKey
								? t('settings.ai.apiKeySaved')
								: t('settings.ai.apiKeyMissing')
						}
					/>
					<TextInput
						autoCapitalize="none"
						autoCorrect={false}
						className="mt-3 min-h-11 rounded-md border border-border
							bg-secondary px-3 text-[14px] text-foreground"
						onChangeText={setApiKeyDraft}
						placeholder={
							settings.hasApiKey
								? t('settings.editor.apiKeyPlaceholderSaved')
								: 'sk-...'
						}
						secureTextEntry
						value={apiKeyDraft}
					/>
					<View className="mt-3 flex-row gap-3">
						<ActionButton
							label={t('common.actions.save')}
							onPress={saveApiKey}
						/>
						{settings.hasApiKey ? (
							<ActionButton
								label={t('common.actions.delete')}
								onPress={deleteApiKey}
								secondary
							/>
						) : null}
					</View>
					{message ? (
						<Text className="mt-3 text-[13px] leading-5 text-muted-foreground">
							{message}
						</Text>
					) : null}
				</SettingsCard>
			</KeyboardAwareScrollView>
		</View>
	);
}

type DropdownAnchor = {
	height: number;
	width: number;
	x: number;
	y: number;
};

function ModelDropdown({
	modelOptions,
	onSelect,
	palette,
	placeholder,
	selectedLabel,
	selectedValue,
}: {
	modelOptions: ProviderModelOption[];
	onSelect: (value: string) => void;
	palette: AppThemePalette;
	placeholder: string;
	selectedLabel: string;
	selectedValue: string;
}) {
	const { height: screenHeight, width } = useWindowDimensions();
	const insets = useSafeAreaInsets();
	const triggerRef = useRef<View>(null);
	const [anchor, setAnchor] = useState<DropdownAnchor | null>(null);
	const [open, setOpen] = useState(false);

	const closeDropdown = useCallback(() => {
		setOpen(false);
	}, []);

	const openDropdown = useCallback(() => {
		if (!triggerRef.current) {
			return;
		}
		triggerRef.current.measureInWindow((x, y, measuredWidth, height) => {
			setAnchor({ height, width: measuredWidth, x, y });
			setOpen(true);
		});
	}, []);

	const selectModel = useCallback(
		(value: string) => {
			onSelect(value);
			setOpen(false);
		},
		[onSelect]
	);

	const dropdownMetrics = useMemo(() => {
		if (!anchor) {
			return null;
		}

		const horizontalPadding = 16;
		const topLimit = Math.max(insets.top + 16, 16);
		const bottomLimit = Math.max(
			insets.bottom + FLOATING_TAB_BAR_CLEARANCE,
			16
		);
		const desiredHeight = Math.min(
			MODEL_DROPDOWN_MAX_HEIGHT,
			modelOptions.length * MODEL_DROPDOWN_ROW_HEIGHT + 8
		);
		const dropdownWidth = Math.min(
			Math.max(anchor.width, 220),
			width - horizontalPadding * 2
		);
		const left = Math.min(
			Math.max(anchor.x, horizontalPadding),
			width - dropdownWidth - horizontalPadding
		);
		const topSpace = anchor.y - topLimit;
		const bottomSpace = screenHeight - (anchor.y + anchor.height) - bottomLimit;
		const openAbove = bottomSpace < desiredHeight && topSpace > bottomSpace;
		const availableHeight = Math.max(
			120,
			(openAbove ? topSpace : bottomSpace) - MODEL_DROPDOWN_GAP
		);
		const maxHeight = Math.min(desiredHeight, availableHeight);

		return {
			bottom: openAbove
				? screenHeight - anchor.y + MODEL_DROPDOWN_GAP
				: undefined,
			left,
			maxHeight,
			top: openAbove
				? undefined
				: anchor.y + anchor.height + MODEL_DROPDOWN_GAP,
			width: dropdownWidth,
		};
	}, [
		anchor,
		insets.bottom,
		insets.top,
		modelOptions.length,
		screenHeight,
		width,
	]);

	return (
		<>
			<View ref={triggerRef} collapsable={false}>
				<Pressable
					className="min-h-11 flex-row items-center justify-between rounded-md
						px-3"
					style={{
						backgroundColor: palette.surfaceMuted,
						borderColor: palette.border,
						borderWidth: 1,
					}}
					onPress={openDropdown}
				>
					<Text
						className={`flex-1 text-[14px] ${
							selectedLabel ? 'text-foreground' : 'text-muted-foreground'
						}`}
						numberOfLines={1}
					>
						{selectedLabel || placeholder}
					</Text>
					<ChevronDown color={palette.iconMuted} size={18} strokeWidth={2.1} />
				</Pressable>
			</View>

			<Modal
				animationType="fade"
				onRequestClose={closeDropdown}
				statusBarTranslucent
				transparent
				visible={open && dropdownMetrics !== null}
			>
				<View style={StyleSheet.absoluteFill}>
					<Pressable
						accessible={false}
						onPress={closeDropdown}
						style={StyleSheet.absoluteFill}
					/>
					{dropdownMetrics ? (
						<View
							className="overflow-hidden rounded-md shadow-lg"
							style={{
								backgroundColor: palette.surface,
								bottom: dropdownMetrics.bottom,
								borderColor: palette.border,
								borderWidth: 1,
								elevation: 12,
								left: dropdownMetrics.left,
								maxHeight: dropdownMetrics.maxHeight,
								position: 'absolute',
								top: dropdownMetrics.top,
								width: dropdownMetrics.width,
							}}
						>
							<ScrollView
								bounces={false}
								keyboardShouldPersistTaps="handled"
								nestedScrollEnabled
								showsVerticalScrollIndicator={
									modelOptions.length * MODEL_DROPDOWN_ROW_HEIGHT >
									dropdownMetrics.maxHeight
								}
							>
								<View className="p-1">
									{modelOptions.map((option) => {
										const active = option.value === selectedValue;

										return (
											<Pressable
												accessibilityRole="button"
												accessibilityState={{ selected: active }}
												className="min-h-11 flex-row items-center
													justify-between gap-3 rounded-sm px-3 py-2"
												key={option.value}
												onPress={() => selectModel(option.value)}
												style={{
													backgroundColor: active
														? palette.surfaceMuted
														: 'transparent',
												}}
											>
												<Text
													className={`flex-1 text-[14px] ${
														active
															? 'font-semibold text-foreground'
															: 'text-foreground/80'
														}`}
													numberOfLines={1}
												>
													{option.name}
												</Text>
												{active ? (
													<Check
														color={palette.icon}
														size={15}
														strokeWidth={2.4}
													/>
												) : null}
											</Pressable>
										);
									})}
								</View>
							</ScrollView>
						</View>
					) : null}
				</View>
			</Modal>
		</>
	);
}

function ProviderOption({
	active,
	label,
	onPress,
	provider,
}: {
	active: boolean;
	label: string;
	onPress: () => void;
	provider: AiProvider;
}) {
	const palette = useAppThemePalette();

	return (
		<Pressable
			onPress={onPress}
			className="min-h-[58px] flex-row items-center rounded-md border px-3 py-3"
			style={{
				backgroundColor: active ? palette.accentSurface : palette.surfaceMuted,
				borderColor: active ? palette.accentSurface : palette.border,
				borderWidth: 1,
			}}
		>
			<ProviderGlyph active={active} provider={provider} />
			<View className="ml-3 flex-1 gap-1">
				<Text
					className="text-[14px] font-semibold"
					style={{
						color: active ? palette.accentForeground : palette.foreground,
					}}
				>
					{label}
				</Text>
			</View>
			{active ? (
				<Check color={palette.accentForeground} size={15} strokeWidth={2.4} />
			) : null}
		</Pressable>
	);
}

function ProtocolChip({
	active,
	label,
	onPress,
}: {
	active: boolean;
	label: string;
	onPress: () => void;
}) {
	const palette = useAppThemePalette();

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
				className="text-[12px] font-semibold"
				style={{
					color: active ? palette.accentForeground : palette.foreground,
				}}
			>
				{label}
			</Text>
		</Pressable>
	);
}

function FieldLabel({ icon, label }: { icon: ReactNode; label: string }) {
	return (
		<View className="flex-row items-center gap-1.5">
			{icon}
			<Text className="text-[13px] font-semibold text-foreground">{label}</Text>
		</View>
	);
}

function ActionButton({
	label,
	onPress,
	secondary = false,
}: {
	label: string;
	onPress: () => void;
	secondary?: boolean;
}) {
	const palette = useAppThemePalette();

	return (
		<Pressable
			onPress={onPress}
			className="rounded-md px-4 py-2"
			style={{
				backgroundColor: secondary
					? palette.surfaceMuted
					: palette.accentSurface,
			}}
		>
			<Text
				className="text-[13px] font-semibold"
				style={{
					color: secondary ? palette.foreground : palette.accentForeground,
				}}
			>
				{label}
			</Text>
		</Pressable>
	);
}
