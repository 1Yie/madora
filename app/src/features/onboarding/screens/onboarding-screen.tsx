import { useMemo, useState, type ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { ChevronDown } from 'lucide-react-native';

import modelsByProvider from '@/assets/models.json';
import { Input, InputField } from '@/components/ui/input';
import { useNativeToast } from '@/components/ui/native-toast';
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
import {
	Slider,
	SliderFilledTrack,
	SliderThumb,
	SliderTrack,
} from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import {
	useAiSettings,
	type AiProvider,
	type CustomProviderProtocol,
} from '@/features/ai';
import { ProviderGlyph } from '@/features/ai/components/provider-glyph';
import { getProviderDefinitions } from '@/features/ai/lib/provider-definitions';
import { QrScanner, useMadoraSync } from '@/features/madora-sync';
import {
	DEFAULT_EDITOR_FONT_SIZE,
	MAX_EDITOR_FONT_SIZE,
	MIN_EDITOR_FONT_SIZE,
	getLocalePreferenceOptions,
	useAppSettings,
	useAppThemePalette,
	type LocalePreference,
	type ThemePreference,
} from '@/features/settings';
import { AppEdgeFade } from '@/shared/components';

const ONBOARDING_STEPS = [
	'welcome',
	'workspace',
	'sync',
	'ai',
	'ready',
] as const;
type OnboardingStep = (typeof ONBOARDING_STEPS)[number];

const CONTENT_STEPS: Exclude<OnboardingStep, 'welcome' | 'ready'>[] = [
	'workspace',
	'sync',
	'ai',
];

const THEME_OPTIONS: ThemePreference[] = ['system', 'light', 'dark'];
const CUSTOM_PROTOCOLS: CustomProviderProtocol[] = [
	'openai',
	'anthropic',
	'google',
];

type ProviderModelOption = {
	name: string;
	value: string;
};

const FADE_EXTRA_TOP = 0;
const FADE_EXTRA_BOTTOM = 0;

export function OnboardingScreen({ onComplete }: { onComplete: () => void }) {
	const insets = useSafeAreaInsets();
	const { t } = useTranslation();
	const palette = useAppThemePalette();
	const [step, setStep] = useState<OnboardingStep>('welcome');
	const stepIndex = ONBOARDING_STEPS.indexOf(step);
	const isFirstStep = stepIndex === 0;
	const isLastStep = stepIndex === ONBOARDING_STEPS.length - 1;

	const handleNext = () => {
		if (isLastStep) {
			onComplete();
			return;
		}
		setStep(ONBOARDING_STEPS[stepIndex + 1]);
	};

	const handleBack = () => {
		if (isFirstStep) return;
		setStep(ONBOARDING_STEPS[stepIndex - 1]);
	};

	return (
		<View
			className="relative flex-1"
			style={{ backgroundColor: palette.background }}
		>
			<KeyboardAwareScrollView
				bottomOffset={24}
				bounces={false}
				keyboardDismissMode="interactive"
				keyboardShouldPersistTaps="handled"
				style={{ flex: 1 }}
				contentContainerStyle={{
					flexGrow: 1,
					paddingBottom: Math.max(insets.bottom, 20) + 16,
					paddingTop: Math.max(insets.top, 16) + 20,
				}}
				showsVerticalScrollIndicator={false}
			>
				<View className="flex-1 px-6">
					<View className="mb-4 min-h-10 flex-row items-center justify-end">
						<Pressable
							accessibilityLabel={t('onboarding.skipAction')}
							onPress={onComplete}
							className="min-h-8 justify-center rounded-full px-2"
						>
							<Text
								className="text-[13px] font-semibold"
								style={{ color: palette.mutedForeground }}
							>
								{t('onboarding.skipAction')}
							</Text>
						</Pressable>
					</View>

					<View className="flex-1 justify-center gap-8">
						{step === 'welcome' ? <WelcomeStep /> : null}
						{step === 'workspace' ? <WorkspaceStep /> : null}
						{step === 'sync' ? <SyncStep /> : null}
						{step === 'ai' ? <AiStep /> : null}
						{step === 'ready' ? <ReadyStep /> : null}
					</View>

					<View className="gap-3 pt-8">
						<StepDots activeIndex={stepIndex} />
						<View className="flex-row gap-2">
							{isFirstStep ? null : (
								<Pressable
									accessibilityLabel={t('common.actions.back')}
									onPress={handleBack}
									className="h-12 w-24 items-center justify-center rounded-full
										border px-3"
									style={{
										backgroundColor: palette.surface,
										borderColor: palette.border,
									}}
								>
									<Text
										className="text-[14px] font-semibold"
										style={{ color: palette.foreground }}
									>
										{t('common.actions.back')}
									</Text>
								</Pressable>
							)}
							<Pressable
								accessibilityLabel={
									isLastStep
										? t('onboarding.primaryAction')
										: t('onboarding.nextAction')
								}
								onPress={handleNext}
								className="h-12 flex-1 items-center justify-center rounded-full
									px-5"
								style={{ backgroundColor: palette.accentSurface }}
							>
								<Text
									className="text-[15px] font-semibold"
									style={{ color: palette.accentForeground }}
								>
									{isLastStep
										? t('onboarding.primaryAction')
										: t('onboarding.nextAction')}
								</Text>
							</Pressable>
						</View>
					</View>
				</View>
			</KeyboardAwareScrollView>
			<AppEdgeFade
				backgroundColor={palette.background}
				height={insets.top + FADE_EXTRA_TOP}
				position="top"
			/>
			<AppEdgeFade
				backgroundColor={palette.background}
				height={insets.bottom + FADE_EXTRA_BOTTOM}
				position="bottom"
			/>
		</View>
	);
}

function WelcomeStep() {
	const { t } = useTranslation();
	const palette = useAppThemePalette();
	const {
		localePreference,
		setLocalePreference,
		setThemePreference,
		themePreference,
	} = useAppSettings();

	return (
		<View className="gap-6">
			<View>
				<Text
					className="text-[36px] font-semibold leading-[42px]"
					style={{ color: palette.foreground }}
				>
					{t('onboarding.title')}
				</Text>
				<Text
					className="mt-4 text-[19px] leading-7"
					style={{ color: palette.mutedForeground }}
				>
					{t('onboarding.taglineTop')}
					{'\n'}
					{t('onboarding.taglineBottom')}
				</Text>
			</View>

			<SettingPanel title={t('onboarding.languageTitle')}>
				<View className="flex-row flex-wrap gap-2">
					{getLocalePreferenceOptions().map((locale) => (
						<ChoiceChip
							key={locale}
							active={localePreference === locale}
							label={getLocaleLabel(t, locale)}
							onPress={() => setLocalePreference(locale)}
						/>
					))}
				</View>
			</SettingPanel>

			<SettingPanel title={t('settings.appearance.cards.theme.title')}>
				<View className="flex-row flex-wrap gap-2">
					{THEME_OPTIONS.map((theme) => (
						<ChoiceChip
							key={theme}
							active={themePreference === theme}
							label={t(`settings.appearance.theme.${theme}.label`)}
							onPress={() => setThemePreference(theme)}
						/>
					))}
				</View>
			</SettingPanel>
		</View>
	);
}

function WorkspaceStep() {
	const { t } = useTranslation();
	const { editorFontSize, saveMode, setEditorFontSize, setSaveMode } =
		useAppSettings();

	return (
		<View className="gap-5">
			<StepHeading step="workspace" />

			<SettingPanel title={t('settings.editor.cards.input.title')}>
				<View className="gap-2">
					<SaveModeRow
						active={saveMode === 'auto'}
						description={t('settings.editor.rows.autoSave.description')}
						onPress={() => setSaveMode('auto')}
						title={t('settings.editor.rows.autoSave.title')}
					/>
					<SaveModeRow
						active={saveMode === 'manual'}
						description={t('onboarding.controls.manualSave.description')}
						onPress={() => setSaveMode('manual')}
						title={t('onboarding.controls.manualSave.title')}
					/>
				</View>
			</SettingPanel>

			<SettingPanel title={t('settings.appearance.editorTextSize.label')}>
				<View className="gap-3">
					<View className="flex-row items-center justify-between gap-3">
						<Text
							className="font-mono text-[18px] font-semibold text-foreground"
						>
							{editorFontSize}px
						</Text>
						<ResetButton
							label={t('settings.appearance.editorTextSize.reset')}
							onPress={() => setEditorFontSize(DEFAULT_EDITOR_FONT_SIZE)}
						/>
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
			</SettingPanel>
		</View>
	);
}

function SyncStep() {
	const { t } = useTranslation();
	const {
		connectionState,
		disconnect,
		errorMessage,
		localDeviceName,
		pairFromQrPayload,
		pairedHost,
		ready,
		setLocalDeviceName,
	} = useMadoraSync();
	const [scannerVisible, setScannerVisible] = useState(false);
	const [deviceNameDraft, setDeviceNameDraft] = useState<string | null>(null);
	const [saving, setSaving] = useState(false);
	const visibleDeviceName = deviceNameDraft ?? localDeviceName;
	const trimmedDeviceName = visibleDeviceName.trim();
	const canSaveDeviceName =
		ready &&
		!saving &&
		trimmedDeviceName.length > 0 &&
		trimmedDeviceName !== localDeviceName;

	const handleSaveDeviceName = async () => {
		if (!canSaveDeviceName) return;
		setSaving(true);
		try {
			await setLocalDeviceName(trimmedDeviceName);
			setDeviceNameDraft(null);
		} finally {
			setSaving(false);
		}
	};

	const handleScanned = async (raw: string) => {
		setScannerVisible(false);
		await pairFromQrPayload(raw);
	};

	return (
		<View className="gap-5">
			<StepHeading step="sync" />

			<SettingPanel
				description={t('syncSettings.localDevice.detail')}
				title={t('syncSettings.localDevice.title')}
			>
				<View className="gap-3">
					<Input>
						<InputField
							autoCapitalize="words"
							autoCorrect={false}
							onChangeText={setDeviceNameDraft}
							onSubmitEditing={() => void handleSaveDeviceName()}
							placeholder={t('syncSettings.localDevice.placeholder')}
							returnKeyType="done"
							value={visibleDeviceName}
						/>
					</Input>
					<ActionButton
						disabled={!canSaveDeviceName}
						label={
							saving
								? t('syncSettings.localDevice.saving')
								: t('common.actions.save')
						}
						onPress={() => void handleSaveDeviceName()}
					/>
				</View>
			</SettingPanel>

			<SettingPanel title={t('syncSettings.pairing.title')}>
				<View className="gap-3">
					<View className="gap-1">
						<Text className="text-[16px] font-semibold text-foreground">
							{pairedHost?.name ?? t('syncSettings.pairing.ready')}
						</Text>
						<Text className="text-[12px] leading-5 text-muted-foreground">
							{pairedHost
								? `${pairedHost.host}:${pairedHost.port}`
								: t('syncSettings.pairing.instructions')}
						</Text>
					</View>
					<View className="flex-row gap-2">
						<ActionButton
							label={
								pairedHost
									? t('syncSettings.pairing.repair')
									: t('syncSettings.pairing.pair')
							}
							onPress={() => setScannerVisible(true)}
						/>
						{pairedHost ? (
							<ActionButton
								label={t('common.actions.disconnect')}
								onPress={disconnect}
								secondary
							/>
						) : null}
					</View>
					{errorMessage ? (
						<Text className="text-[12px] leading-5 text-destructive">
							{errorMessage}
						</Text>
					) : null}
				</View>
			</SettingPanel>

			<SettingPanel title={t('syncSettings.connection.title')}>
				<View className="gap-3">
					<InfoRow
						label={t('syncSettings.connection.state')}
						value={t(`common.status.${connectionState}`)}
					/>
					<InfoRow
						label={t('syncSettings.pairing.title')}
						value={pairedHost?.name ?? t('syncSettings.pairing.ready')}
					/>
				</View>
			</SettingPanel>
			<QrScanner
				onClose={() => setScannerVisible(false)}
				onScanned={(raw) => void handleScanned(raw)}
				visible={scannerVisible}
			/>
		</View>
	);
}

function AiStep() {
	const { t } = useTranslation();
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
	const { showToast } = useNativeToast();
	const canSaveApiKey = settings.ready && apiKeyDraft.trim().length > 0;

	const saveApiKey = async () => {
		if (!canSaveApiKey) return;
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
		<View className="gap-5">
			<StepHeading step="ai" />

			<SettingPanel title={t('settings.editor.cards.ai.title')}>
				<SettingSwitchRow
					description={t('settings.editor.rows.enableAi.description')}
					onValueChange={settings.setEnabled}
					title={t('settings.editor.rows.enableAi.title')}
					value={settings.enabled}
				/>
			</SettingPanel>

			<SettingPanel title={t('common.labels.provider')}>
				<View className="gap-2">
					{providers.map((provider) => (
						<ProviderOption
							key={provider.key}
							active={settings.provider === provider.key}
							label={provider.label}
							onPress={() => settings.setProvider(provider.key)}
							provider={provider.key}
						/>
					))}
				</View>
			</SettingPanel>

			{isCustomProvider ? (
				<SettingPanel title={t('settings.editor.customConfigTitle')}>
					<View className="gap-3">
						<View className="flex-row flex-wrap gap-2">
							{CUSTOM_PROTOCOLS.map((protocol) => (
								<ChoiceChip
									key={protocol}
									active={settings.customProtocol === protocol}
									label={t(
										`settings.editor.customProtocolOptions.${protocol}.label`
									)}
									onPress={() => settings.setCustomProtocol(protocol)}
								/>
							))}
						</View>

						<LabeledInput label={t('common.labels.apiUrl')}>
							<InputField
								autoCapitalize="none"
								autoCorrect={false}
								onChangeText={settings.setApiUrl}
								placeholder="https://api.example.com"
								value={settings.apiUrl}
							/>
						</LabeledInput>

						<SettingSwitchRow
							description={t('settings.editor.httpsHint')}
							onValueChange={settings.setUseSsl}
							title={t('common.labels.https')}
							value={settings.useSsl}
						/>
					</View>
				</SettingPanel>
			) : null}

			<SettingPanel title={t('common.labels.model')}>
				{isCustomProvider || modelOptions.length === 0 ? (
					<LabeledInput label={selectedProvider?.label ?? settings.provider}>
						<InputField
							autoCapitalize="none"
							autoCorrect={false}
							onChangeText={settings.setModel}
							placeholder={selectedProvider?.defaultModel || 'model-name'}
							value={settings.model}
						/>
					</LabeledInput>
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
			</SettingPanel>

			<SettingPanel title={t('common.labels.apiKey')}>
				<View className="gap-3">
					<Text className="text-[13px] leading-5 text-muted-foreground">
						{settings.hasApiKey
							? t('settings.ai.apiKeySaved')
							: t('settings.ai.apiKeyMissing')}
					</Text>
					<Input>
						<InputField
							autoCapitalize="none"
							autoCorrect={false}
							onChangeText={setApiKeyDraft}
							onSubmitEditing={() => void saveApiKey()}
							placeholder={
								settings.hasApiKey
									? t('settings.editor.apiKeyPlaceholderSaved')
									: 'sk-...'
							}
							returnKeyType="done"
							secureTextEntry
							value={apiKeyDraft}
						/>
					</Input>
					<View className="flex-row gap-2">
						<ActionButton
							disabled={!canSaveApiKey}
							label={t('common.actions.save')}
							onPress={() => void saveApiKey()}
						/>
						{settings.hasApiKey ? (
							<ActionButton
								label={t('common.actions.delete')}
								onPress={() => void deleteApiKey()}
								secondary
							/>
						) : null}
					</View>
				</View>
			</SettingPanel>
		</View>
	);
}

function ReadyStep() {
	const { t } = useTranslation();
	const palette = useAppThemePalette();
	const { saveMode, themePreference } = useAppSettings();
	const { provider } = useAiSettings();
	const { connectionState, localDeviceName } = useMadoraSync();
	const providers = useMemo(() => getProviderDefinitions(), []);
	const selectedProvider =
		providers.find((item) => item.key === provider)?.label ?? provider;

	return (
		<View className="gap-6">
			<View>
				<Text
					className="text-[36px] font-semibold leading-[42px]"
					style={{ color: palette.foreground }}
				>
					{t('onboarding.ready.title')}
				</Text>
				<Text
					className="mt-4 text-[17px] leading-7"
					style={{ color: palette.mutedForeground }}
				>
					{t('onboarding.ready.detail')}
				</Text>
			</View>

			<SettingPanel title={t('onboarding.summary.title')}>
				<View className="gap-3">
					<InfoRow
						label={t('settings.appearance.cards.theme.title')}
						value={t(`settings.appearance.theme.${themePreference}.label`)}
					/>
					<InfoRow
						label={t('settings.editor.rows.autoSave.title')}
						value={
							saveMode === 'auto'
								? t('settings.editor.rows.autoSave.title')
								: t('onboarding.controls.manualSave.title')
						}
					/>
					<InfoRow
						label={t('syncSettings.localDevice.title')}
						value={localDeviceName}
					/>
					<InfoRow
						label={t('syncSettings.connection.state')}
						value={t(`common.status.${connectionState}`)}
					/>
					<InfoRow
						label={t('common.labels.provider')}
						value={selectedProvider}
					/>
				</View>
			</SettingPanel>

			<Text
				className="text-[13px] leading-5"
				style={{ color: palette.mutedForeground }}
			>
				{t('onboarding.footnote')}
			</Text>
		</View>
	);
}

function StepHeading({ step }: { step: (typeof CONTENT_STEPS)[number] }) {
	const { t } = useTranslation();
	const palette = useAppThemePalette();

	return (
		<View className="gap-3">
			<Text
				className="text-[13px] font-semibold uppercase tracking-[1.3px]"
				style={{ color: palette.mutedForeground }}
			>
				{t('onboarding.stepLabel', {
					current: CONTENT_STEPS.indexOf(step) + 1,
					total: CONTENT_STEPS.length,
				})}
			</Text>
			<View>
				<Text
					className="text-[34px] font-semibold leading-[40px]"
					style={{ color: palette.foreground }}
				>
					{t(`onboarding.items.${step}.title`)}
				</Text>
				<Text
					className="mt-3 text-[16px] leading-6"
					style={{ color: palette.mutedForeground }}
				>
					{t(`onboarding.items.${step}.detail`)}
				</Text>
			</View>
		</View>
	);
}

function SettingPanel({
	children,
	description,
	title,
}: {
	children: ReactNode;
	description?: string;
	title: string;
}) {
	const palette = useAppThemePalette();

	return (
		<View
			className="gap-3 rounded-lg border p-4"
			style={{
				backgroundColor: palette.surface,
				borderColor: palette.border,
			}}
		>
			<View className="gap-1">
				<Text
					className="text-[14px] font-semibold"
					style={{ color: palette.foreground }}
				>
					{title}
				</Text>
				{description ? (
					<Text
						className="text-[12px] leading-5"
						style={{ color: palette.mutedForeground }}
					>
						{description}
					</Text>
				) : null}
			</View>
			{children}
		</View>
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
	const palette = useAppThemePalette();

	return (
		<View className="flex-row items-center justify-between gap-4">
			<View className="flex-1 gap-1">
				<Text
					className="text-[14px] font-semibold"
					style={{ color: palette.foreground }}
				>
					{title}
				</Text>
				<Text
					className="text-[12px] leading-5"
					style={{ color: palette.mutedForeground }}
				>
					{description}
				</Text>
			</View>
			<Switch value={value} onValueChange={onValueChange} />
		</View>
	);
}

function SaveModeRow({
	active,
	description,
	onPress,
	title,
}: {
	active: boolean;
	description: string;
	onPress: () => void;
	title: string;
}) {
	const palette = useAppThemePalette();

	return (
		<Pressable
			onPress={onPress}
			className="min-h-[58px] rounded-md border px-3 py-3"
			style={{
				backgroundColor: active ? palette.accentSurface : palette.surfaceMuted,
				borderColor: active ? palette.accentSurface : palette.border,
			}}
		>
			<Text
				className="text-[14px] font-semibold"
				style={{
					color: active ? palette.accentForeground : palette.foreground,
				}}
			>
				{title}
			</Text>
			<Text
				className="mt-1 text-[12px] leading-5"
				style={{
					color: active ? palette.accentForeground : palette.mutedForeground,
				}}
			>
				{description}
			</Text>
		</Pressable>
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
			className="min-h-11 flex-row items-center rounded-md border px-3 py-2"
			style={{
				backgroundColor: active ? palette.accentSurface : palette.surfaceMuted,
				borderColor: active ? palette.accentSurface : palette.border,
			}}
		>
			<ProviderGlyph active={active} provider={provider} />
			<Text
				className="ml-3 flex-1 text-[14px] font-semibold"
				style={{
					color: active ? palette.accentForeground : palette.foreground,
				}}
			>
				{label}
			</Text>
		</Pressable>
	);
}

function ChoiceChip({
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
			accessibilityLabel={label}
			onPress={onPress}
			className="min-h-9 justify-center rounded-full border px-3.5"
			style={{
				backgroundColor: active ? palette.accentSurface : palette.surfaceMuted,
				borderColor: active ? palette.accentSurface : palette.border,
			}}
		>
			<Text
				className="text-[13px] font-semibold"
				style={{
					color: active ? palette.accentForeground : palette.foreground,
				}}
			>
				{label}
			</Text>
		</Pressable>
	);
}

function LabeledInput({
	children,
	label,
}: {
	children: ReactNode;
	label: string;
}) {
	const palette = useAppThemePalette();

	return (
		<View className="gap-2">
			<Text
				className="text-[12px] font-semibold"
				style={{ color: palette.mutedForeground }}
			>
				{label}
			</Text>
			<Input>{children}</Input>
		</View>
	);
}

function ActionButton({
	disabled = false,
	label,
	onPress,
	secondary = false,
}: {
	disabled?: boolean;
	label: string;
	onPress: () => void;
	secondary?: boolean;
}) {
	const palette = useAppThemePalette();

	return (
		<Pressable
			disabled={disabled}
			onPress={onPress}
			className={`min-h-9 items-center justify-center rounded-md px-4 py-2
				flex-1 ${disabled ? 'opacity-40' : ''}`}
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

function ResetButton({
	label,
	onPress,
}: {
	label: string;
	onPress: () => void;
}) {
	const palette = useAppThemePalette();

	return (
		<Pressable
			onPress={onPress}
			className="min-h-9 items-center justify-center rounded-full px-3 py-2"
			style={{ backgroundColor: palette.surfaceMuted }}
		>
			<Text
				className="text-[12px] font-semibold"
				style={{ color: palette.foreground }}
			>
				{label}
			</Text>
		</Pressable>
	);
}

function InfoRow({ label, value }: { label: string; value: string }) {
	const palette = useAppThemePalette();

	return (
		<View className="flex-row items-center justify-between gap-3">
			<Text className="text-[13px]" style={{ color: palette.mutedForeground }}>
				{label}
			</Text>
			<Text
				className="flex-1 text-right text-[13px] font-semibold"
				style={{ color: palette.foreground }}
			>
				{value}
			</Text>
		</View>
	);
}

function StepDots({ activeIndex }: { activeIndex: number }) {
	const palette = useAppThemePalette();

	return (
		<View className="flex-row justify-center gap-1.5">
			{ONBOARDING_STEPS.map((item, index) => (
				<View
					key={item}
					className="h-1.5 rounded-full"
					style={{
						backgroundColor:
							index === activeIndex ? palette.foreground : palette.border,
						width: index === activeIndex ? 18 : 6,
					}}
				/>
			))}
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
