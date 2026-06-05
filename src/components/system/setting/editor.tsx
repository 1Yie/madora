import {
	Sparkles,
	Check,
	Edit,
	X,
	KeyRound,
	Bot,
	Globe,
	Lock,
	Server,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import {
	type CustomProviderProtocol,
	getProviderDefinitions,
	useAiSettings,
} from '@/components/system/ai-settings-provider';
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

const CUSTOM_PROTOCOL_OPTIONS: Array<{
	description: string;
	label: string;
	value: CustomProviderProtocol;
}> = [
	{
		description: '适用于 /v1/chat/completions 一类 OpenAI 兼容接口。',
		label: 'OpenAI Compatible',
		value: 'openai',
	},
	{
		description: '适用于 /v1/messages 一类 Anthropic 兼容接口。',
		label: 'Anthropic Compatible',
		value: 'anthropic',
	},
];

type ProviderModelOption = {
	name: string;
	value: string;
};

export function EditorSettings() {
	const {
		apiUrl,
		customProtocol,
		deleteApiKey,
		enabled,
		hasApiKey,
		model,
		provider,
		saveApiKey,
		saveMode,
		showHiddenFiles,
		useSsl,
		setApiUrl,
		setCustomProtocol,
		setEnabled,
		setModel,
		setProvider,
		setSaveMode,
		setShowHiddenFiles,
		setUseSsl,
	} = useAiSettings();

	const [apiKeyDraft, setApiKeyDraft] = useState('');
	const [, setApiKeyBusy] = useState(false);
	const [, setSavedAt] = useState<Date | null>(null);
	const [isEditing, setIsEditing] = useState<boolean>(() => !hasApiKey);

	const selectedProvider = getProviderDefinitions().find(
		(item) => item.key === provider
	);
	const isCustom = provider === 'custom';
	const availableModels =
		(providerModels as Record<string, ProviderModelOption[]>)[provider] ?? [];
	const selectedCustomProtocolOption = CUSTOM_PROTOCOL_OPTIONS.find(
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
			showSuccessToast('API Key 已保存到系统钥匙串');
		} catch (error) {
			showErrorToast(
				'保存 API Key 失败',
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
			showSuccessToast('已从系统钥匙串删除 API Key');
		} catch (error) {
			showErrorToast(
				'删除 API Key 失败',
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
			<SettingsSectionCard title="输入行为">
				<div className="space-y-2">
					<SettingRow
						title="自动保存"
						description="开启后编辑内容会自动写入文件。"
					>
						<Switch
							checked={saveMode === 'auto'}
							onCheckedChange={(checked) =>
								setSaveMode(checked ? 'auto' : 'manual')
							}
						/>
					</SettingRow>
					<SettingRow
						title="显示隐藏文件"
						description={
							<>
								控制侧栏是否显示以{' '}
								<code className="rounded bg-muted px-1 font-mono">.</code>{' '}
								开头的文件和目录。
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

			<SettingsSectionCard title="AI 配置">
				<div className="space-y-5">
					<SettingRow
						title={
							<span className="flex items-center gap-2">
								<Sparkles className="size-4" />
								启用 AI 自动补全
							</span>
						}
						description="开启后在输入时会自动向后补全文本。"
					>
						<Switch checked={enabled} onCheckedChange={setEnabled} />
					</SettingRow>

					<div className="space-y-2">
						<span className="text-sm font-medium text-foreground">
							Provider
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
							各 Provider 的 Key 和模型独立保存，切换后不会互相覆盖。
						</p>
					</div>

					{isCustom && (
						<div
							className="space-y-4 rounded-xl border border-border bg-muted/30
								px-4 py-4"
						>
							<p
								className="text-xs font-medium uppercase tracking-wide
									text-muted-foreground"
							>
								自定义接口配置
							</p>

							<FieldBlock
								label="协议"
								icon={<Globe />}
								hint={selectedCustomProtocolOption?.description}
							>
								<Select
									value={customProtocol}
									onValueChange={(value) => {
										if (value === 'openai' || value === 'anthropic') {
											setCustomProtocol(value);
										}
									}}
								>
									<SelectTrigger>
										<SelectValue placeholder="选择兼容协议...">
											{selectedCustomProtocolOption?.label}
										</SelectValue>
									</SelectTrigger>
									<SelectContent>
										{CUSTOM_PROTOCOL_OPTIONS.map((option) => (
											<SelectItem key={option.value} value={option.value}>
												{option.label}
											</SelectItem>
										))}
									</SelectContent>
								</Select>
							</FieldBlock>

							<FieldBlock
								label="API URL"
								icon={<Server />}
								hint="自定义 Provider 的接口地址。"
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
												HTTPS
											</span>
										</div>
										<p className="text-xs text-muted-foreground">
											未填写协议时自动使用；自建服务可关闭。
										</p>
									</div>
								</div>
								<Switch checked={useSsl} onCheckedChange={setUseSsl} />
							</div>
						</div>
					)}

					<FieldBlock
						label="API Key"
						icon={<KeyRound />}
						hint={
							<span className="space-y-0.5">
								<span className="block">
									{hasApiKey
										? '当前 Provider 已保存 API Key，重新输入并保存可覆盖旧值。'
										: '当前 Provider 尚未保存 API Key。'}
								</span>
								<span className="block">
									Key 存储在系统钥匙串中，不会上传云端，仅通过本机请求使用。
								</span>
							</span>
						}
					>
						<InputGroup>
							<Input
								autoComplete="off"
								placeholder={hasApiKey && !isEditing ? '已保存' : 'sk-...'}
								type="password"
								value={apiKeyDraft}
								onChange={(e) => setApiKeyDraft(e.target.value)}
								aria-label="API Key"
								disabled={!isEditing}
							/>
							<InputGroupAddon align="inline-end">
								{!isEditing ? (
									<Button
										size="icon-xs"
										variant="ghost"
										onClick={() => setIsEditing(true)}
										aria-label="编辑 API Key"
									>
										<Edit />
									</Button>
								) : (
									<div className="flex items-center gap-1">
										<Button
											size="icon-xs"
											variant="ghost"
											onClick={() => void handleConfirm()}
											aria-label="确认保存"
										>
											<Check />
										</Button>
										<Button
											size="icon-xs"
											variant="ghost"
											onClick={handleCancel}
											aria-label="取消编辑"
										>
											<X />
										</Button>
									</div>
								)}
							</InputGroupAddon>
						</InputGroup>
					</FieldBlock>

					<FieldBlock
						label="Model"
						icon={<Bot />}
						hint={
							isCustom
								? '填写模型名称，不同模型的功能和表现请参考提供方说明。'
								: undefined
						}
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
										placeholder={loadingModels ? '加载中...' : '选择模型...'}
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
								正在加载模型列表...
							</p>
						) : null}
					</FieldBlock>
				</div>
			</SettingsSectionCard>
		</div>
	);
}
