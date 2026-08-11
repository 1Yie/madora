import {
	Sparkle as Sparkles,
	Check,
	PencilSimple as Edit,
	X,
	Key as KeyRound,
	Robot as Bot,
	Globe,
	LockSimple as Lock,
	HardDrives as Server,
} from '@phosphor-icons/react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
	type CustomProviderProtocol,
	getProviderDefinitions,
	useAiSettings,
} from '@/context/ai-settings-provider';
import {
	type CloseBehavior,
	useAppSettings,
} from '@/context/app-settings-provider';
import {
	FieldBlock,
	Option,
	SettingRow,
	SettingsSectionCard,
} from '@/components/system/setting/shared';
import { providerIconMap } from '@/components/ui/provider-icons';
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { InputGroup, InputGroupAddon } from '@/components/ui/input-group';
import { Switch } from '@/components/ui/switch';
import { showErrorToast, showSuccessToast } from '@/components/ui/toast';
import providerModels from '@/assets/models.json';

type ProviderModelOption = {
	name: string;
	value: string;
};

function CloseBehaviorSetting() {
	const { t } = useTranslation();
	const { closeBehavior, setCloseBehavior } = useAppSettings();
	const options: Array<{
		description: string;
		label: string;
		value: CloseBehavior;
	}> = [
		{
			description: t('settings.editor.closeBehavior.minimize.description'),
			label: t('settings.editor.closeBehavior.minimize.label'),
			value: 'minimize',
		},
		{
			description: t('settings.editor.closeBehavior.exit.description'),
			label: t('settings.editor.closeBehavior.exit.label'),
			value: 'exit',
		},
	];

	return (
		<div className="grid gap-3 md:grid-cols-2">
			{options.map((option) => (
				<Option
					key={option.value}
					active={closeBehavior === option.value}
					description={option.description}
					label={option.label}
					onClick={() => setCloseBehavior(option.value)}
				/>
			))}
		</div>
	);
}

export function EditorSettings() {
	const { t } = useTranslation();
	const {
		apiUrl,
		customProtocol,
		deleteApiKey,
		enabled,
		hasApiKey,
		model,
		provider,
		saveApiKey,
		useSsl,
		setApiUrl,
		setCustomProtocol,
		setEnabled,
		setModel,
		setProvider,
		setUseSsl,
	} = useAiSettings();
	const { saveMode, showHiddenFiles, setSaveMode, setShowHiddenFiles } =
		useAppSettings();

	const [apiKeyDraft, setApiKeyDraft] = useState('');
	const [, setApiKeyBusy] = useState(false);
	const [, setSavedAt] = useState<Date | null>(null);
	const [isEditing, setIsEditing] = useState<boolean>(() => !hasApiKey);

	const selectedProvider = getProviderDefinitions().find(
		(item) => item.key === provider
	);
	const isCustom = provider === 'custom';
	const customProtocolOptions: Array<{
		description: string;
		label: string;
		value: CustomProviderProtocol;
	}> = [
		{
			description: t(
				'settings.editor.customProtocolOptions.anthropic.description'
			),
			label: t('settings.editor.customProtocolOptions.anthropic.label'),
			value: 'anthropic',
		},
		{
			description: t(
				'settings.editor.customProtocolOptions.google.description'
			),
			label: t('settings.editor.customProtocolOptions.google.label'),
			value: 'google',
		},
		{
			description: t(
				'settings.editor.customProtocolOptions.openai.description'
			),
			label: t('settings.editor.customProtocolOptions.openai.label'),
			value: 'openai',
		},
	];
	const availableModels =
		(providerModels as Record<string, ProviderModelOption[]>)[provider] ?? [];
	const selectedCustomProtocolOption = customProtocolOptions.find(
		(option) => option.value === customProtocol
	);
	const selectedModelLabel =
		availableModels.find((item) => item.value === model)?.name ?? model;
	const loadingModels = false;

	useEffect(() => {
		queueMicrotask(() => {
			setApiKeyDraft('');
			if (!hasApiKey) setSavedAt(null);
			setIsEditing(!hasApiKey);
		});
	}, [provider, hasApiKey]);

	const handleSaveApiKey = async () => {
		try {
			setApiKeyBusy(true);
			await saveApiKey(apiKeyDraft);
			setSavedAt(new Date());
			setApiKeyDraft('');
			setIsEditing(false);
			showSuccessToast(t('settings.editor.toasts.apiKeySaved'));
		} catch (error) {
			showErrorToast(
				t('settings.editor.toasts.apiKeySaveFailed'),
				error instanceof Error ? error.message : String(error)
			);
		} finally {
			setApiKeyBusy(false);
		}
	};

	const handleDeleteApiKey = async () => {
		try {
			setApiKeyBusy(true);
			await deleteApiKey();
			setApiKeyDraft('');
			setSavedAt(null);
			setIsEditing(false);
			showSuccessToast(t('settings.editor.toasts.apiKeyDeleted'));
		} catch (error) {
			showErrorToast(
				t('settings.editor.toasts.apiKeyDeleteFailed'),
				error instanceof Error ? error.message : String(error)
			);
		} finally {
			setApiKeyBusy(false);
		}
	};

	const handleConfirm = async () => {
		if (apiKeyDraft.trim().length === 0) {
			if (hasApiKey) {
				await handleDeleteApiKey();
			} else {
				setIsEditing(false);
			}
			return;
		}
		await handleSaveApiKey();
	};

	const handleCancel = () => {
		setApiKeyDraft('');
		setIsEditing(false);
	};

	return (
		<div className="space-y-4">
			<SettingsSectionCard title={t('settings.editor.cards.input.title')}>
				<div className="divide-y divide-border">
					<SettingRow
						title={t('settings.editor.rows.autoSave.title')}
						description={t('settings.editor.rows.autoSave.description')}
					>
						<Switch
							checked={saveMode === 'auto'}
							onCheckedChange={(checked) =>
								setSaveMode(checked ? 'auto' : 'manual')
							}
						/>
					</SettingRow>
					<SettingRow
						title={t('settings.editor.rows.hiddenFiles.title')}
						description={
							<>
								{t('settings.editor.rows.hiddenFiles.prefix')}{' '}
								<code className="rounded bg-muted px-1 font-mono">.</code>{' '}
								{t('settings.editor.rows.hiddenFiles.suffix')}
							</>
						}
					>
						<Switch
							checked={showHiddenFiles}
							onCheckedChange={setShowHiddenFiles}
						/>
					</SettingRow>
				</div>
			</SettingsSectionCard>

			<SettingsSectionCard title={t('settings.editor.cards.window.title')}>
				<CloseBehaviorSetting />
			</SettingsSectionCard>

			<SettingsSectionCard title={t('settings.editor.cards.ai.title')}>
				<div className="space-y-5">
					<SettingRow
						title={
							<span className="flex items-center gap-2">
								<Sparkles className="size-4" />
								{t('settings.editor.rows.enableAi.title')}
							</span>
						}
						description={t('settings.editor.rows.enableAi.description')}
					>
						<Switch checked={enabled} onCheckedChange={setEnabled} />
					</SettingRow>

					<div className="space-y-2">
						<span className="text-sm font-medium text-foreground">
							{t('common.labels.provider')}
						</span>
						<div className="grid gap-2 md:grid-cols-2">
							{getProviderDefinitions().map((item) => {
								const IconComponent = providerIconMap[item.key];
								return (
									<Option
										key={item.key}
										active={provider === item.key}
										label={item.label}
										icon={IconComponent ? <IconComponent /> : undefined}
										onClick={() => setProvider(item.key)}
									/>
								);
							})}
						</div>
						<p className="text-xs text-muted-foreground">
							{t('settings.editor.providerHint')}
						</p>
					</div>

					{isCustom && (
						<div className="space-y-4">
							<p
								className="text-xs font-medium uppercase tracking-wide
									text-muted-foreground"
							>
								{t('settings.editor.customConfigTitle')}
							</p>

							<FieldBlock
								label={t('common.labels.protocol')}
								icon={<Globe />}
								hint={selectedCustomProtocolOption?.description}
							>
								<Select
									value={customProtocol}
									onValueChange={(value) => {
										if (
											value === 'anthropic' ||
											value === 'google' ||
											value === 'openai'
										) {
											setCustomProtocol(value);
										}
									}}
								>
									<SelectTrigger>
										<SelectValue
											placeholder={t(
												'settings.editor.customProtocolPlaceholder'
											)}
										>
											{selectedCustomProtocolOption?.label}
										</SelectValue>
									</SelectTrigger>
									<SelectContent>
										{customProtocolOptions.map((option) => (
											<SelectItem key={option.value} value={option.value}>
												{option.label}
											</SelectItem>
										))}
									</SelectContent>
								</Select>
							</FieldBlock>

							<FieldBlock
								label={t('common.labels.apiUrl')}
								icon={<Server />}
								hint={t('settings.editor.apiUrlHint')}
							>
								<Input
									autoComplete="off"
									placeholder={
										selectedProvider?.defaultApiUrl || 'https://api.example.com'
									}
									value={apiUrl}
									onChange={(e) => setApiUrl(e.target.value)}
								/>
							</FieldBlock>

							<div className="flex items-center justify-between gap-4">
								<div className="flex items-center">
									<div className="space-y-1.5">
										<div className="flex items-center gap-1.5">
											<Lock className="size-3.5 text-muted-foreground" />
											<span className="text-sm font-medium text-foreground">
												{t('common.labels.https')}
											</span>
										</div>
										<p className="text-xs text-muted-foreground">
											{t('settings.editor.httpsHint')}
										</p>
									</div>
								</div>
								<Switch checked={useSsl} onCheckedChange={setUseSsl} />
							</div>
						</div>
					)}

					<FieldBlock
						label={t('common.labels.apiKey')}
						icon={<KeyRound />}
						hint={
							<span className="space-y-0.5">
								<span className="block">
									{hasApiKey
										? t('settings.editor.apiKeyHint.existing')
										: t('settings.editor.apiKeyHint.missing')}
								</span>
								<span className="block">
									{t('settings.editor.apiKeyHint.storage')}
								</span>
							</span>
						}
					>
						<InputGroup>
							<Input
								autoComplete="off"
								placeholder={
									hasApiKey && !isEditing
										? t('settings.editor.apiKeyPlaceholderSaved')
										: 'sk-...'
								}
								type="password"
								value={apiKeyDraft}
								onChange={(e) => setApiKeyDraft(e.target.value)}
								aria-label={t('common.labels.apiKey')}
								disabled={!isEditing}
							/>
							<InputGroupAddon align="inline-end">
								{!isEditing ? (
									<Button
										size="icon-xs"
										variant="ghost"
										onClick={() => setIsEditing(true)}
										aria-label={t('settings.editor.editApiKeyAria')}
									>
										<Edit />
									</Button>
								) : (
									<div className="flex items-center gap-1">
										<Button
											size="icon-xs"
											variant="ghost"
											onClick={() => void handleConfirm()}
											aria-label={t('settings.editor.confirmSaveAria')}
										>
											<Check />
										</Button>
										<Button
											size="icon-xs"
											variant="ghost"
											onClick={handleCancel}
											aria-label={t('settings.editor.cancelEditAria')}
										>
											<X />
										</Button>
									</div>
								)}
							</InputGroupAddon>
						</InputGroup>
					</FieldBlock>

					<FieldBlock
						label={t('common.labels.model')}
						icon={<Bot />}
						hint={isCustom ? t('settings.editor.modelHintCustom') : undefined}
					>
						{isCustom ? (
							<Input
								autoComplete="off"
								placeholder={selectedProvider?.defaultModel || 'model-name'}
								value={model}
								onChange={(e) => setModel(e.target.value)}
							/>
						) : availableModels.length > 0 ? (
							<Select
								value={model}
								onValueChange={(value) => value && setModel(value)}
							>
								<SelectTrigger>
									<SelectValue
										placeholder={
											loadingModels
												? t('settings.editor.loadingSelect')
												: t('settings.editor.modelPlaceholder')
										}
									>
										{selectedModelLabel || undefined}
									</SelectValue>
								</SelectTrigger>
								<SelectContent>
									{availableModels.map((option) => (
										<SelectItem key={option.value} value={option.value}>
											{option.name}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						) : loadingModels ? (
							<p className="text-xs text-muted-foreground">
								{t('settings.editor.loadingModels')}
							</p>
						) : null}
					</FieldBlock>
				</div>
			</SettingsSectionCard>
		</div>
	);
}
