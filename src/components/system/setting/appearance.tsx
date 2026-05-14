import { useTheme } from '@/components/system/theme-provider';
import { useProseTheme } from '@/components/system/prose-theme-provider';
import {
	SettingsSectionCard,
	ThemeOption,
} from '@/components/system/setting/shared';
import { Textarea } from '@/components/ui/textarea';

function CheckIcon({ className }: { className?: string }) {
	return (
		<svg
			className={className}
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			strokeWidth={2.5}
			strokeLinecap="round"
			strokeLinejoin="round"
		>
			<polyline points="20 6 9 17 4 12" />
		</svg>
	);
}

function PlusIcon({ className }: { className?: string }) {
	return (
		<svg
			className={className}
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			strokeWidth={2.5}
			strokeLinecap="round"
			strokeLinejoin="round"
		>
			<line x1="12" y1="5" x2="12" y2="19" />
			<line x1="5" y1="12" x2="19" y2="12" />
		</svg>
	);
}

function hexToRgb(hex: string) {
	const h = hex.replace(/^#/, '');
	const bigint = parseInt(
		h.length === 3
			? h
					.split('')
					.map((c) => c + c)
					.join('')
			: h,
		16
	);
	const r = (bigint >> 16) & 255;
	const g = (bigint >> 8) & 255;
	const b = bigint & 255;
	return { r, g, b };
}

function rgbToHsl(r: number, g: number, b: number) {
	r /= 255;
	g /= 255;
	b /= 255;
	const max = Math.max(r, g, b),
		min = Math.min(r, g, b);
	let h = 0,
		s = 0;
	const l = (max + min) / 2;
	if (max !== min) {
		const d = max - min;
		s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
		switch (max) {
			case r:
				h = (g - b) / d + (g < b ? 6 : 0);
				break;
			case g:
				h = (b - r) / d + 2;
				break;
			case b:
				h = (r - g) / d + 4;
				break;
		}
		h /= 6;
	}
	return { h: h * 360, s, l };
}

const SYSTEM_SWATCH = `conic-gradient(
  #7C3AED 0 60deg,
  #0EA5E9 60deg 120deg,
  #10B981 120deg 180deg,
  #F59E0B 180deg 240deg,
  #EF4444 240deg 300deg,
  #6366F1 300deg 360deg
)`;

const CUSTOM_SWATCH =
	'conic-gradient(red, yellow, lime, cyan, blue, magenta, red)';
const DEFAULT_SWATCH =
	'linear-gradient(135deg, color-mix(in oklab, var(--color-foreground) 18%, var(--color-background)), color-mix(in oklab, var(--color-foreground) 6%, var(--color-background)))';

const PRESETS: Array<[string, string]> = [
	['#7C3AED', '紫色'],
	['#0EA5E9', '青色'],
	['#EF4444', '红色'],
	['#F59E0B', '琥珀'],
	['#10B981', '绿色'],
	['#6366F1', '靛蓝'],
];

export function AppearanceSettings() {
	const { theme, setTheme, accent, accentMode, setAccent, setAccentMode } =
		useTheme();
	const { customCss, setCustomCss } = useProseTheme();

	const sorted = [...PRESETS].sort((a, b) => {
		const aRgb = hexToRgb(a[0]);
		const bRgb = hexToRgb(b[0]);
		return (
			rgbToHsl(aRgb.r, aRgb.g, aRgb.b).h - rgbToHsl(bRgb.r, bRgb.g, bRgb.b).h
		);
	});

	const isDefault = accentMode === 'default';
	const isSystem = accentMode === 'system';
	const selectedPreset = accentMode === 'custom' ? accent : null;
	const isCustom =
		accentMode === 'custom' &&
		accent !== null &&
		!sorted.some(([hex]) => hex === accent);

	return (
		<div className="space-y-4">
			<SettingsSectionCard
				description="选择应用的主题模式，跟随系统、浅色或深色"
				title="主题模式"
			>
				<div className="grid gap-3 md:grid-cols-3">
					<ThemeOption
						active={theme === 'system'}
						description="跟随当前设备或系统设置决定。"
						label="跟随系统"
						onClick={() => setTheme('system')}
					/>
					<ThemeOption
						active={theme === 'light'}
						description="更适合明亮环境，页面层次会更轻。"
						label="浅色"
						onClick={() => setTheme('light')}
					/>
					<ThemeOption
						active={theme === 'dark'}
						description="适合夜间或长时间阅读，界面对比更柔和。"
						label="深色"
						onClick={() => setTheme('dark')}
					/>
				</div>
			</SettingsSectionCard>

			<SettingsSectionCard description="配置应用的主题强调色" title="主题颜色">
				<div className="grid grid-cols-3 gap-2.5 md:grid-cols-4 mb-4">
					<button
						type="button"
						className={`flex items-center gap-3 rounded-xl border px-4 py-3
							text-left transition-colors ${
								isSystem
									? 'border-primary bg-primary/8'
									: 'border-border bg-background hover:bg-muted/50'
							}`}
						onClick={() => setAccentMode('system')}
					>
						<div
							className="h-9 w-9 shrink-0 rounded-lg"
							style={{ background: SYSTEM_SWATCH }}
						/>
						<div className="text-sm font-medium">跟随系统</div>
					</button>

					<button
						type="button"
						className={`flex items-center gap-3 rounded-xl border px-4 py-3
							text-left transition-colors ${
								isDefault
									? 'border-primary bg-primary/8'
									: 'border-border bg-background hover:bg-muted/50'
							}`}
						onClick={() => setAccentMode('default')}
					>
						<div
							className="h-9 w-9 shrink-0 rounded-lg"
							style={{ background: DEFAULT_SWATCH }}
						/>
						<div className="text-sm font-medium">默认主题</div>
					</button>

					<label
						className={`relative cursor-pointer overflow-hidden rounded-xl
							border transition-colors ${
								isCustom
									? 'border-primary bg-primary/8'
									: 'border-border bg-background hover:bg-muted/50'
							}`}
					>
						<input
							type="color"
							className="sr-only"
							value={isCustom ? accent : '#000000'}
							onChange={(e) => setAccent(e.target.value)}
						/>
						<div className="flex h-full items-center gap-3 px-4 py-3">
							<div
								className="relative h-9 w-9 shrink-0 rounded-lg"
								style={{ background: isCustom ? accent : CUSTOM_SWATCH }}
							>
								{!isCustom && (
									<span
										className="absolute inset-0 flex items-center
											justify-center"
									>
										<span
											className="flex h-5 w-5 items-center justify-center
												rounded-full bg-white/80"
										>
											<PlusIcon className="h-3 w-3 text-gray-800" />
										</span>
									</span>
								)}
								{isCustom && (
									<span
										className="absolute bottom-0.5 right-0.5 flex h-4.5 w-4.5
											items-center justify-center rounded-full bg-white/90"
									>
										<CheckIcon className="h-3 w-3 text-gray-800" />
									</span>
								)}
							</div>
							<div>
								<div className="text-sm font-medium">自定义</div>
								{isCustom && (
									<div className="font-mono text-[11px] text-muted-foreground">
										{accent}
									</div>
								)}
							</div>
						</div>
					</label>
				</div>

				<div className="grid grid-cols-3 gap-2.5 md:grid-cols-4">
					{sorted.map(([hex, label]) => (
						<button
							key={hex}
							type="button"
							onClick={() => setAccent(hex)}
							className={`relative overflow-hidden rounded-xl border text-left
							transition-colors ${
								selectedPreset === hex
									? 'border-primary bg-primary/8'
									: 'border-border bg-background hover:bg-muted/50'
							}`}
						>
							<div className="flex h-full w-full flex-col">
								<div
									className="relative h-10 w-full"
									style={{ background: hex }}
								>
									{selectedPreset === hex && (
										<span
											className="absolute bottom-1 right-1 flex h-4.5 w-4.5
												items-center justify-center rounded-full bg-white/90"
										>
											<CheckIcon className="h-3 w-3 text-gray-800" />
										</span>
									)}
								</div>
								<div className="px-3 py-2">
									<div className="text-sm font-medium">{label}</div>
									<div className="font-mono text-[11px] text-muted-foreground">
										{hex}
									</div>
								</div>
							</div>
						</button>
					))}
				</div>
			</SettingsSectionCard>
			<SettingsSectionCard
				description="自定义 Markdown 预览的 CSS 样式"
				title="自定义 CSS"
			>
				<div
					className="[&_textarea]:min-h-60 [&_textarea]:font-mono
						[&_textarea]:text-sm"
				>
					<Textarea
						onChange={(e) => setCustomCss(e.target.value)}
						placeholder={`.prose-custom h1 {\n  font-size: 2.5rem;\n}\n\n.prose-custom blockquote {\n  border-left-color: var(--primary);\n}`}
						spellCheck={false}
						value={customCss}
					/>
				</div>
				<div className="pt-2">
					<p className="text-xs text-muted-foreground">
						选择器应以 <code>.prose-custom</code>{' '}
						为前缀，以避免与应用其他部分的样式冲突。
					</p>
				</div>
			</SettingsSectionCard>
		</div>
	);
}
