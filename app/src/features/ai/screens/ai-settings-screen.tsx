import { useMemo, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import {
	Check,
	ChevronDown,
	Info,
	KeyRound,
	Lock,
	Server,
	Sparkles,
} from 'lucide-react-native';

import modelsByProvider from '@/assets/models.json';
import { useNativeToast } from '@/components/ui/native-toast';
import { Input, InputField } from '@/components/ui/input';
import {
	Select,
	SelectBackdrop,
	SelectContent,
	SelectDragIndicator,
	SelectDragIndicatorWrapper,
	SelectInput,
	SelectItem,
	SelectPortal,
	SelectScrollView,
	SelectTrigger,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import {
	APP_THEME_BACKGROUND_COLORS,
	SettingsCard,
	useAppThemePalette,
	useResolvedThemePreference,
} from '@/features/settings';
import { useMadoraSync } from '@/features/madora-sync';
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
	const {
		connectionState,
		desktopAiCompletionAvailable,
		useDesktopAiCompletion,
	} = useMadoraSync();
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
	const { showToast } = useNativeToast();
	const remoteCompletionActive =
		connectionState === 'connected' &&
		desktopAiCompletionAvailable &&
		useDesktopAiCompletion;

	const saveApiKey = async () => {
		try {
			await settings.saveApiKey(apiKeyDraft);
			setApiKeyDraft('');
			showToast({
				description: t('settings.editor.toasts.apiKeySaved'),
				title: t('common.actions.save'),
				tone: 'success',
			});
		} catch (error) {
			showToast({
				description: error instanceof Error ? error.message : String(error),
				title: t('settings.editor.toasts.apiKeySaveFailed'),
				tone: 'error',
			});
		}
	};

	const deleteApiKey = async () => {
		try {
			await settings.deleteApiKey();
			setApiKeyDraft('');
			showToast({
				description: t('settings.editor.toasts.apiKeyDeleted'),
				title: t('common.actions.delete'),
				tone: 'success',
			});
		} catch (error) {
			showToast({
				description: error instanceof Error ? error.message : String(error),
				title: t('settings.editor.toasts.apiKeyDeleteFailed'),
				tone: 'error',
			});
		}
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

				{remoteCompletionActive ? <RemoteCompletionNotice /> : null}

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
							<Input>
								<InputField
									autoCapitalize="none"
									autoCorrect={false}
									onChangeText={settings.setApiUrl}
									placeholder="https://api.example.com"
									value={settings.apiUrl}
								/>
							</Input>

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
						<Input>
							<InputField
								autoCapitalize="none"
								autoCorrect={false}
								onChangeText={settings.setModel}
								placeholder={selectedProvider?.defaultModel || 'model-name'}
								value={settings.model}
							/>
						</Input>
					) : (
						<Select
							closeOnOverlayClick
							key={`${settings.provider}:${settings.model}`}
							onValueChange={settings.setModel}
							placeholder={t('settings.editor.modelPlaceholder')}
							selectedValue={settings.model}
							selectedLabel={selectedModelLabel}
						>
							<SelectTrigger>
								<SelectInput
									placeholder={t('settings.editor.modelPlaceholder')}
								/>
								<ChevronDown
									color={palette.iconMuted}
									size={18}
									strokeWidth={2.1}
								/>
							</SelectTrigger>
							<SelectPortal>
								<SelectBackdrop />
								<SelectContent>
									<SelectDragIndicatorWrapper>
										<SelectDragIndicator />
									</SelectDragIndicatorWrapper>
									<SelectScrollView>
										{modelOptions.map((option) => (
											<SelectItem
												key={option.value}
												label={option.name}
												value={option.value}
											/>
										))}
									</SelectScrollView>
								</SelectContent>
							</SelectPortal>
						</Select>
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
					<View className="mt-3">
						<Input>
							<InputField
								autoCapitalize="none"
								autoCorrect={false}
								onChangeText={setApiKeyDraft}
								placeholder={
									settings.hasApiKey
										? t('settings.editor.apiKeyPlaceholderSaved')
										: 'sk-...'
								}
								secureTextEntry
								value={apiKeyDraft}
							/>
						</Input>
					</View>
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
				</SettingsCard>
			</KeyboardAwareScrollView>
		</View>
	);
}

function RemoteCompletionNotice() {
	const { t } = useTranslation();
	const palette = useAppThemePalette();

	return (
		<View
			className="flex-row gap-3 rounded-md border px-3 py-3"
			style={{
				backgroundColor: palette.surfaceMuted,
				borderColor: palette.border,
			}}
		>
			<View
				className="mt-0.5 h-8 w-8 items-center justify-center rounded-full"
				style={{ backgroundColor: palette.accentSurface }}
			>
				<Info color={palette.accentForeground} size={16} strokeWidth={2.2} />
			</View>
			<View className="flex-1 gap-1">
				<Text className="text-[14px] font-semibold text-foreground">
					{t('settings.editor.remoteCompletionNotice.title')}
				</Text>
				<Text className="text-[12px] leading-5 text-muted-foreground">
					{t('settings.editor.remoteCompletionNotice.description')}
				</Text>
			</View>
		</View>
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
