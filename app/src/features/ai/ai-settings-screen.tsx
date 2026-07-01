import { useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { ArrowLeft } from 'lucide-react-native';
import { Switch } from '@/components/ui/switch';
import { getProviderDefinitions } from './provider-definitions';
import { useAiSettings } from './settings-provider';
import type { CustomProviderProtocol } from './types';

const CUSTOM_PROTOCOLS: CustomProviderProtocol[] = [
	'openai',
	'anthropic',
	'google',
];

export function AiSettingsScreen({ onBack }: { onBack?: () => void }) {
	const { t } = useTranslation();
	const insets = useSafeAreaInsets();
	const settings = useAiSettings();
	const providers = useMemo(() => getProviderDefinitions(), []);
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
		setMessage(t('settings.editor.toasts.apiKeyDeleted'));
	};

	return (
		<View style={{ flex: 1, backgroundColor: '#fbfcff' }}>
			{onBack ? (
				<View
					pointerEvents="box-none"
					className="absolute left-4 z-10"
					style={{ top: insets.top + 12 }}
				>
					<Pressable
						onPress={onBack}
						className="h-9 flex-row items-center gap-1.5 self-start rounded-full
							bg-secondary px-4"
					>
						<ArrowLeft color="#111827" size={16} strokeWidth={2.2} />
						<Text className="text-[13px] font-semibold text-foreground">
							{t('common.actions.back')}
						</Text>
					</Pressable>
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
				<View className="gap-1">
					<Text
						className="text-[12px] font-semibold uppercase
							text-muted-foreground"
					>
						{t('settings.sections.editor.label')}
					</Text>
					<Text className="text-[24px] font-semibold text-foreground">
						{t('settings.editor.cards.ai.title')}
					</Text>
					<Text className="text-[13px] leading-5 text-muted-foreground">
						{t('settings.editor.providerHint')}
					</Text>
				</View>

				<View className="rounded-lg border border-border bg-background p-4">
					<View className="flex-row items-center justify-between gap-4">
						<View className="flex-1 gap-1">
							<Text className="text-[16px] font-semibold text-foreground">
								{t('settings.editor.rows.enableAi.title')}
							</Text>
							<Text className="text-[13px] leading-5 text-muted-foreground">
								{t('settings.editor.rows.enableAi.description')}
							</Text>
						</View>
						<Switch
							value={settings.enabled}
							onValueChange={settings.setEnabled}
						/>
					</View>
				</View>

				<View
					className="gap-3 rounded-lg border border-border bg-background p-4"
				>
					<Text className="text-[16px] font-semibold text-foreground">
						{t('common.labels.provider')}
					</Text>
					<ScrollView horizontal showsHorizontalScrollIndicator={false}>
						<View className="flex-row gap-2">
							{providers.map((provider) => (
								<ProviderButton
									key={provider.key}
									active={settings.provider === provider.key}
									label={provider.label}
									onPress={() => settings.setProvider(provider.key)}
								/>
							))}
						</View>
					</ScrollView>
					<Text className="text-[12px] leading-5 text-muted-foreground">
						{t('settings.editor.providerHint')}
					</Text>
				</View>

				{settings.provider === 'custom' ? (
					<View
						className="gap-3 rounded-lg border border-border bg-background p-4"
					>
						<Text className="text-[16px] font-semibold text-foreground">
							{t('settings.editor.customConfigTitle')}
						</Text>
						<View className="flex-row flex-wrap gap-2">
							{CUSTOM_PROTOCOLS.map((protocol) => (
								<ProviderButton
									key={protocol}
									active={settings.customProtocol === protocol}
									label={t(
										`settings.editor.customProtocolOptions.${protocol}.label`
									)}
									onPress={() => settings.setCustomProtocol(protocol)}
								/>
							))}
						</View>
					</View>
				) : null}

				<SettingsField
					label={t('common.labels.apiUrl')}
					detail={t('settings.editor.apiUrlHint')}
				>
					<TextInput
						autoCapitalize="none"
						autoCorrect={false}
						className="min-h-11 rounded-md border border-border bg-secondary
							px-3 text-[14px] text-foreground"
						onChangeText={settings.setApiUrl}
						placeholder="https://api.example.com"
						value={settings.apiUrl}
					/>
					<View className="mt-3 flex-row items-center justify-between">
						<View className="mr-3 flex-1 gap-1">
							<Text className="text-[13px] font-medium text-foreground">
								{t('common.labels.https')}
							</Text>
							<Text className="text-[12px] leading-5 text-muted-foreground">
								{t('settings.editor.httpsHint')}
							</Text>
						</View>
						<Switch
							value={settings.useSsl}
							onValueChange={settings.setUseSsl}
						/>
					</View>
				</SettingsField>

				<SettingsField
					label={t('common.labels.model')}
					detail={
						settings.provider === 'custom'
							? t('settings.editor.modelHintCustom')
							: undefined
					}
				>
					<TextInput
						autoCapitalize="none"
						autoCorrect={false}
						className="min-h-11 rounded-md border border-border bg-secondary
							px-3 text-[14px] text-foreground"
						onChangeText={settings.setModel}
						placeholder="model-name"
						value={settings.model}
					/>
				</SettingsField>

				<SettingsField
					label={t('common.labels.apiKey')}
					detail={`${
						settings.hasApiKey
							? t('settings.editor.apiKeyHint.existing')
							: t('settings.editor.apiKeyHint.missing')
					} ${t('settings.editor.apiKeyHint.storage')}`}
				>
					<TextInput
						autoCapitalize="none"
						autoCorrect={false}
						className="min-h-11 rounded-md border border-border bg-secondary
							px-3 text-[14px] text-foreground"
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
				</SettingsField>
			</KeyboardAwareScrollView>
		</View>
	);
}

function SettingsField({
	children,
	detail,
	label,
}: {
	children: ReactNode;
	detail?: string;
	label: string;
}) {
	return (
		<View className="gap-3 rounded-lg border border-border bg-background p-4">
			<View className="gap-1">
				<Text className="text-[16px] font-semibold text-foreground">
					{label}
				</Text>
				{detail ? (
					<Text className="text-[13px] leading-5 text-muted-foreground">
						{detail}
					</Text>
				) : null}
			</View>
			{children}
		</View>
	);
}

function ProviderButton({
	active,
	label,
	onPress,
}: {
	active: boolean;
	label: string;
	onPress: () => void;
}) {
	return (
		<Pressable
			onPress={onPress}
			className={`rounded-full border px-3 py-2 ${
				active
					? 'border-foreground bg-foreground'
					: 'border-border bg-secondary'
				}`}
		>
			<Text
				className={`text-[13px]
					${active ? 'text-background' : 'text-foreground'}`}
			>
				{label}
			</Text>
		</Pressable>
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
	return (
		<Pressable
			onPress={onPress}
			className={`rounded-md px-4 py-2 ${
				secondary ? 'bg-secondary' : 'bg-foreground'
			}`}
		>
			<Text
				className={`text-[13px] font-semibold
					${secondary ? 'text-foreground' : 'text-background'}`}
			>
				{label}
			</Text>
		</Pressable>
	);
}
