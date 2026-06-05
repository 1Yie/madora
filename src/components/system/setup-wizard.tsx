import { streamCompletion } from '@/invoke/ai';
import { ArrowLeft, ArrowRight, CheckIcon, Crown } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';

import appIcon from '@/assets/icon.png';
import providerModels from '@/assets/models.json';
import { LicenseActivationDialog } from '@/components/system/license-activation-dialog';
import { useLicense } from '@/components/system/license-provider';
import {
	type CustomProviderProtocol,
	getProviderDefinitions,
	useAiSettings,
} from '@/components/system/ai-settings-provider';
import { Button } from '@/components/ui/button';
import { Dialog, DialogPopup } from '@/components/ui/dialog';
import {
	AlertDialog,
	AlertDialogClose,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogPopup,
	AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Input } from '@/components/ui/input';
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { providerIconMap } from '@/components/ui/provider-icons';
import { MathCurveLoader } from '@/components/ui/math-curve-loader';
import { cn } from '@/lib/utils';

const SETUP_COMPLETE_KEY = 'madora-setup-complete';
const TEST_PROMPT =
	'## Test\n\nWrite a short greeting in Chinese for a new user of a Markdown editor called Madora.\n\n';

const CUSTOM_PROTOCOL_OPTIONS: Array<{
	label: string;
	value: CustomProviderProtocol;
}> = [
	{ label: 'OpenAI 兼容', value: 'openai' },
	{ label: 'Anthropic 兼容', value: 'anthropic' },
];

const WIZARD_STEPS = [
	'welcome',
	'configure',
	'test',
	'license',
	'success',
] as const;
type WizardStep = (typeof WIZARD_STEPS)[number];
type ProviderModelOption = { name: string; value: string };
type TestStatus = 'idle' | 'loading' | 'success' | 'error';

function markSetupComplete() {
	window.localStorage.setItem(SETUP_COMPLETE_KEY, 'true');
}

// eslint-disable-next-line react-refresh/only-export-components
export function shouldShowSetupWizard(): boolean {
	return window.localStorage.getItem(SETUP_COMPLETE_KEY) !== 'true';
}

export function SetupWizard({ onComplete }: { onComplete: () => void }) {
	const {
		apiUrl,
		customProtocol,
		enabled,
		hasApiKey,
		model,
		provider,
		saveApiKey,
		setApiUrl,
		setCustomProtocol,
		setEnabled,
		setModel,
		setProvider,
		setUseSsl,
		useSsl,
	} = useAiSettings();
	const [skipConfirmOpen, setSkipConfirmOpen] = useState(false);

	const [step, setStep] = useState<WizardStep>('welcome');
	const [apiKeyDraft, setApiKeyDraft] = useState('');
	const [configError, setConfigError] = useState<string | null>(null);
	const [configBusy, setConfigBusy] = useState(false);
	const [testStatus, setTestStatus] = useState<TestStatus>('idle');
	const [testResult, setTestResult] = useState('');
	const testAbortRef = useRef<AbortController | null>(null);
	const { isLoading: licenseLoading } = useLicense();
	const [showActivation, setShowActivation] = useState(false);

	const handleLicenseActivated = useCallback(() => {
		setShowActivation(false);
		setStep('success');
	}, []);

	const handleSkipTrial = useCallback(() => {
		setStep('success');
	}, []);

	const providers = getProviderDefinitions();
	const selectedProvider =
		providers.find((item) => item.key === provider) ?? providers[0];
	const isCustom = provider === 'custom';
	const availableModels =
		(providerModels as Record<string, ProviderModelOption[]>)[provider] ?? [];

	useEffect(() => {
		return () => testAbortRef.current?.abort();
	}, []);

	const handleTestCompletion = useCallback(async () => {
		setTestStatus('loading');
		setTestResult('');
		const abortController = new AbortController();
		testAbortRef.current = abortController;

		try {
			const chunks: string[] = [];

			await streamCompletion({
				config: {
					apiUrl: apiUrl.trim().length > 0 ? apiUrl : null,
					customProtocol: isCustom ? customProtocol : null,
					model: model.trim().length > 0 ? model : null,
					provider,
					useSsl,
				},
				request: { prefix: TEST_PROMPT, suffix: null, title: 'setup-test.md' },
				onChunk: (chunk: string) => {
					if (abortController.signal.aborted) return;
					chunks.push(chunk);
					setTestResult(chunks.join(''));
				},
			});

			if (abortController.signal.aborted) return;

			const finalText = chunks.join('').trim();
			if (finalText.length === 0)
				throw new Error('模型已连接，但返回了空内容。');

			setTestResult(finalText);
			setTestStatus('success');
		} catch (error) {
			if (abortController.signal.aborted) return;
			setTestResult(error instanceof Error ? error.message : String(error));
			setTestStatus('error');
		} finally {
			testAbortRef.current = null;
		}
	}, [apiUrl, customProtocol, isCustom, model, provider, useSsl]);

	const handleContinueToTest = useCallback(async () => {
		const nextApiKey = apiKeyDraft.trim();
		setConfigBusy(true);
		setConfigError(null);

		if (!enabled) setEnabled(true);
		if (isCustom && apiUrl.trim().length === 0) {
			setConfigBusy(false);
			setConfigError('请填写 API 地址。');
			return;
		}
		if (model.trim().length === 0) {
			setConfigBusy(false);
			setConfigError('请选择或填写模型。');
			return;
		}
		if (!hasApiKey && nextApiKey.length === 0) {
			setConfigBusy(false);
			setConfigError('请填写 API Key。');
			return;
		}
		if (nextApiKey.length > 0) {
			try {
				await saveApiKey(nextApiKey);
				setApiKeyDraft('');
			} catch (error) {
				setConfigBusy(false);
				setConfigError(error instanceof Error ? error.message : String(error));
				return;
			}
		}

		setConfigBusy(false);
		setTestStatus('idle');
		setTestResult('');
		setStep('test');
		handleTestCompletion();
	}, [
		handleTestCompletion,
		apiKeyDraft,
		apiUrl,
		enabled,
		hasApiKey,
		isCustom,
		model,
		saveApiKey,
		setEnabled,
	]);

	const stepIndex = WIZARD_STEPS.indexOf(step);

	return (
		<>
			<Dialog open onOpenChange={() => {}}>
				<DialogPopup
					showCloseButton={false}
					className="max-w-110 overflow-hidden rounded-[24px] border-border/40
						p-0 shadow-2xl"
				>
					<div className="relative flex min-h-125 flex-col bg-background">
						{/* 返回按钮 */}
						{step === 'configure' || step === 'test' || step === 'license' ? (
							<button
								onClick={() =>
									setStep(
										step === 'license'
											? 'test'
											: step === 'test'
												? 'configure'
												: 'welcome'
									)
								}
								className="absolute left-6 top-6 z-10 text-muted-foreground
									transition-colors hover:text-foreground"
							>
								<ArrowLeft className="size-6" />
							</button>
						) : null}
						{/* 跳过按钮 */}
						{step !== 'success' && (
							<button
								onClick={() => setSkipConfirmOpen(true)}
								className="absolute right-6 top-6 z-10 text-[13px] font-medium
									text-muted-foreground transition-colors hover:text-foreground"
							>
								跳过
							</button>
						)}

						<div className="flex flex-1 flex-col px-8 pt-12 pb-6 sm:px-10">
							{/* Step 1: 欢迎 */}
							{step === 'welcome' && (
								<div
									className="flex h-full flex-1 animate-in fade-in
										slide-in-from-bottom-4 flex-col duration-500"
								>
									<div
										className="flex flex-1 flex-col items-center justify-center
											text-center"
									>
										<img src={appIcon} alt="Madora" className="mb-8 size-18" />
										<h1
											className="mb-3 text-3xl font-semibold tracking-tight
												text-foreground"
										>
											欢迎使用 Madora
										</h1>
										<p className="font-mono text-xl font-medium tracking-tight">
											Markdown editing,
											<br />
											<span className="text-muted-foreground">
												powered by AI
											</span>
										</p>
									</div>
									<div className="mt-auto w-full pt-6">
										<Button
											className="w-full rounded-full"
											size="lg"
											onClick={() => setStep('configure')}
										>
											开始配置
										</Button>
									</div>
								</div>
							)}

							{/* Step 2: 模型配置 */}
							{step === 'configure' && (
								<div
									className="flex h-full flex-1 animate-in fade-in
										slide-in-from-right-4 flex-col duration-500"
								>
									<div className="flex-1">
										<div className="mb-8 mt-4 text-center">
											<h2 className="text-xl font-medium tracking-tight">
												连接提供商
											</h2>
											<p className="mt-1.5 text-[13px] text-muted-foreground">
												配置你的 AI 补全接口
											</p>
										</div>

										<div className="space-y-5">
											<div className="space-y-1.5">
												<label
													className="text-[13px] font-medium text-foreground"
												>
													Provider
												</label>
												<Select
													value={provider}
													onValueChange={(v) => {
														if (v === null) return;
														setProvider(v);
														setConfigError(null);
														setApiKeyDraft('');
													}}
												>
													<SelectTrigger className="bg-muted/20">
														<SelectValue>
															<div className="flex items-center gap-2">
																{(() => {
																	const IconComponent =
																		providerIconMap[selectedProvider.key];
																	return IconComponent ? (
																		<IconComponent className="size-4" />
																	) : null;
																})()}
																{selectedProvider?.label}
															</div>
														</SelectValue>
													</SelectTrigger>
													<SelectContent>
														{providers.map((item) => {
															const IconComponent = providerIconMap[item.key];
															return (
																<SelectItem key={item.key} value={item.key}>
																	<div className="flex items-center gap-2">
																		{IconComponent && (
																			<IconComponent className="size-4" />
																		)}
																		{item.label}
																	</div>
																</SelectItem>
															);
														})}
													</SelectContent>
												</Select>
											</div>

											{isCustom && (
												<>
													<div className="space-y-1.5">
														<label
															className="text-[13px] font-medium
																text-foreground"
														>
															API 地址
														</label>
														<Input
															placeholder={
																selectedProvider?.defaultApiUrl ||
																'https://api.example.com'
															}
															value={apiUrl}
															onChange={(e) => setApiUrl(e.target.value)}
														/>
													</div>
													<div className="grid grid-cols-2 gap-4">
														<div className="space-y-1.5">
															<label
																className="text-[13px] font-medium
																	text-foreground"
															>
																HTTPS
															</label>
															<div className="flex items-center">
																<Switch
																	checked={useSsl}
																	onCheckedChange={setUseSsl}
																/>
															</div>
														</div>
														<div className="space-y-1.5">
															<label
																className="text-[13px] font-medium
																	text-foreground"
															>
																协议
															</label>
															<Select
																value={customProtocol}
																onValueChange={(v) => {
																	if (v === null) return;
																	setCustomProtocol(
																		v as CustomProviderProtocol
																	);
																}}
															>
																<SelectTrigger className="bg-muted/20">
																	<SelectValue>
																		{
																			CUSTOM_PROTOCOL_OPTIONS.find(
																				(o) => o.value === customProtocol
																			)?.label
																		}
																	</SelectValue>
																</SelectTrigger>
																<SelectContent>
																	{CUSTOM_PROTOCOL_OPTIONS.map((opt) => (
																		<SelectItem
																			key={opt.value}
																			value={opt.value}
																		>
																			{opt.label}
																		</SelectItem>
																	))}
																</SelectContent>
															</Select>
														</div>
													</div>
												</>
											)}

											<div className="space-y-1.5">
												<label
													className="text-[13px] font-medium text-foreground"
												>
													Model
												</label>
												{isCustom ? (
													<Input
														className="bg-muted/20"
														placeholder={
															selectedProvider?.defaultModel || 'model-name'
														}
														value={model}
														onChange={(e) => setModel(e.target.value)}
													/>
												) : (
													<Select
														value={model}
														onValueChange={(v) => v !== null && setModel(v)}
													>
														<SelectTrigger className="bg-muted/20">
															<SelectValue placeholder="选择模型...">
																{availableModels.find((m) => m.value === model)
																	?.name ?? model}
															</SelectValue>
														</SelectTrigger>
														<SelectContent>
															{availableModels.map((opt) => (
																<SelectItem key={opt.value} value={opt.value}>
																	{opt.name}
																</SelectItem>
															))}
														</SelectContent>
													</Select>
												)}
											</div>

											<div className="space-y-1.5">
												<label
													className="flex items-center justify-between
														text-[13px] font-medium text-foreground"
												>
													<span>API Key</span>
													{hasApiKey && (
														<span
															className="text-[11px] font-normal
																text-muted-foreground"
														>
															已保存
														</span>
													)}
												</label>
												<Input
													type="password"
													className="bg-muted/20"
													placeholder={
														hasApiKey ? '留空则沿用当前凭据' : 'sk-...'
													}
													value={apiKeyDraft}
													onChange={(e) => setApiKeyDraft(e.target.value)}
												/>
											</div>

											{configError && (
												<p
													className="animate-in fade-in text-[13px]
														text-destructive"
												>
													{configError}
												</p>
											)}
										</div>
									</div>

									<div className="mt-auto w-full pt-6">
										<Button
											className="w-full rounded-full"
											loading={configBusy}
											onClick={() => void handleContinueToTest()}
										>
											继续
										</Button>
									</div>
								</div>
							)}

							{/* Step 3: 测试 */}
							{step === 'test' && (
								<div
									className="flex h-full flex-1 animate-in fade-in
										slide-in-from-right-4 flex-col duration-500"
								>
									<div className="flex min-h-0 flex-1 flex-col">
										<div className="mb-6 mt-4 text-center">
											<h2 className="text-xl font-medium tracking-tight">
												连接测试
											</h2>
											<p className="mt-1.5 text-[13px] text-muted-foreground">
												正在验证凭据与模型连通性
											</p>
										</div>

										<div
											className={cn(
												`flex flex-1 flex-col rounded-xl border p-4 text-[13px]
												leading-relaxed transition-colors duration-300`,
												testStatus === 'error'
													? `border-destructive/30 bg-destructive/5
														text-destructive`
													: testStatus === 'success'
														? 'border-primary/20 bg-primary/5 text-foreground'
														: `border-border/50 bg-muted/20
															text-muted-foreground font-mono`
											)}
										>
											{testStatus === 'loading' && !testResult && (
												<div
													className="flex h-full flex-col items-center
														justify-center gap-3"
												>
													<MathCurveLoader className="size-8 text-primary" />
													等待响应
												</div>
											)}
											<div className="whitespace-pre-wrap wrap-break-word">
												{testResult}
											</div>
										</div>
									</div>

									<div className="mt-auto w-full pt-6">
										{testStatus === 'error' ? (
											<Button
												variant="secondary"
												className="w-full rounded-full"
												onClick={() => void handleTestCompletion()}
											>
												重新测试
											</Button>
										) : (
											<Button
												className="w-full rounded-full"
												disabled={testStatus !== 'success'}
												onClick={() => setStep('license')}
											>
												完成验证
											</Button>
										)}
									</div>
								</div>
							)}

							{/* Step 4: 许可证 */}
							{step === 'license' && (
								<div
									className="flex h-full flex-1 animate-in fade-in zoom-in-95
										flex-col duration-500"
								>
									<div
										className="flex flex-1 flex-col items-center justify-center
											text-center"
									>
										<div
											className="mb-8 flex size-16 items-center justify-center
												rounded-full bg-primary/10 text-primary"
										>
											<Crown className="size-10" />
										</div>
										<h1
											className="mb-3 text-2xl font-semibold tracking-tight
												text-foreground"
										>
											许可证
										</h1>
										<p
											className="mb-4 text-sm leading-relaxed
												text-muted-foreground"
										>
											已有许可证？激活它以获得完整功能。
											<br />
											你也可以稍后在设置中激活，先试用再决定。
										</p>
									</div>

									<div className="mt-auto w-full space-y-2 pt-6">
										<div className="flex flex-col gap-2 sm:flex-row">
											<Button
												variant="outline"
												className="flex-1 rounded-full"
												size="lg"
												disabled={licenseLoading}
												onClick={handleSkipTrial}
											>
												先试用
											</Button>
											<Button
												className="flex-1 rounded-full"
												size="lg"
												disabled={licenseLoading}
												onClick={() => setShowActivation(true)}
											>
												<Crown className="size-4" />
												激活许可证
											</Button>
										</div>
									</div>
								</div>
							)}

							{/* Step 5: 成功 */}
							{step === 'success' && (
								<div
									className="flex h-full flex-1 animate-in fade-in zoom-in-95
										flex-col duration-500"
								>
									<div
										className="flex flex-1 flex-col items-center justify-center
											text-center"
									>
										<div
											className="mb-8 flex size-16 items-center justify-center
												rounded-full bg-primary/10 text-primary"
										>
											<CheckIcon className="size-10" />
										</div>
										<h1
											className="mb-3 text-2xl font-semibold tracking-tight
												text-foreground"
										>
											一切就绪
										</h1>
										<p
											className="mb-10 text-sm leading-relaxed
												text-muted-foreground"
										>
											Madora 已配置完毕。
											<br />
											打开你的 Markdown 文件，即刻开始写作。
										</p>
									</div>

									<div className="mt-auto w-full pt-6">
										<Button
											className="w-full rounded-full"
											size="lg"
											onClick={() => {
												markSetupComplete();
												onComplete();
											}}
										>
											进入编辑器 <ArrowRight className="ml-2 size-4" />
										</Button>
									</div>
								</div>
							)}
						</div>

						{/* 进度指示器 Dots */}
						<div className="flex items-center justify-center gap-2 pb-8">
							{WIZARD_STEPS.map((_, index) => (
								<div
									key={index}
									className={cn(
										'h-1.5 rounded-full transition-all duration-300',
										stepIndex === index
											? 'w-6 bg-primary'
											: stepIndex > index
												? 'w-1.5 bg-primary/40'
												: 'w-1.5 bg-border'
									)}
								/>
							))}
						</div>
					</div>
				</DialogPopup>
				<AlertDialog open={skipConfirmOpen} onOpenChange={setSkipConfirmOpen}>
					<AlertDialogPopup>
						<AlertDialogHeader>
							<AlertDialogTitle>跳过设置？</AlertDialogTitle>
							<AlertDialogDescription>
								确定要跳过设置步骤吗？你可以稍后在设置中重新配置 AI 补全。
							</AlertDialogDescription>
						</AlertDialogHeader>
						<AlertDialogFooter>
							<AlertDialogClose
								render={<Button variant="secondary">取消</Button>}
							/>
							<AlertDialogClose
								render={<Button>确定跳过</Button>}
								onClick={() => {
									markSetupComplete();
									onComplete();
								}}
							/>
						</AlertDialogFooter>
					</AlertDialogPopup>
				</AlertDialog>
			</Dialog>
			<LicenseActivationDialog
				open={showActivation}
				onOpenChange={setShowActivation}
				onActivated={handleLicenseActivated}
			/>
		</>
	);
}
