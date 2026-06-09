import { Check, Plus } from 'lucide-react';
import { useState } from 'react';
import { useTheme } from '@/components/system/theme-provider';
import {
	Option,
	SettingsSectionCard,
} from '@/components/system/setting/shared';
import { cn } from '@/lib/utils';
import { setTabBarMode } from '@/invoke/workspace';

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
	return {
		r: (bigint >> 16) & 255,
		g: (bigint >> 8) & 255,
		b: bigint & 255,
	};
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
  #7C3AED 0 60deg, #0EA5E9 60deg 120deg, #10B981 120deg 180deg,
  #F59E0B 180deg 240deg, #EF4444 240deg 300deg, #6366F1 300deg 360deg
)`;
const CUSTOM_SWATCH =
	'conic-gradient(red, yellow, lime, cyan, blue, magenta, red)';
const DEFAULT_SWATCH = `linear-gradient(135deg,
  color-mix(in oklab, var(--color-foreground) 18%, var(--color-background)),
  color-mix(in oklab, var(--color-foreground) 6%, var(--color-background)))`;

const PRESETS: Array<[string, string]> = [
	['#7C3AED', '紫色'],
	['#0EA5E9', '青色'],
	['#EF4444', '红色'],
	['#F59E0B', '琥珀'],
	['#10B981', '绿色'],
	['#6366F1', '靛蓝'],
];

function swatchCardCn(active: boolean) {
	return cn(
		'rounded-xl border transition-colors text-left',
		active
			? 'border-primary bg-primary/8'
			: 'border-border bg-background hover:bg-muted/50'
	);
}

function ActiveBadge() {
	return (
		<span
			className="absolute bottom-1 right-1 flex h-4.5 w-4.5 items-center
				justify-center rounded-full bg-white/90"
		>
			<Check className="h-3 w-3 text-gray-800" strokeWidth={2.5} />
		</span>
	);
}

const TAB_BAR_MODE_KEY = 'madora-tab-bar-mode';

function TabBarModeSetting() {
	const [mode, setMode] = useState<'scroll' | 'wrap'>(
		() =>
			(window.localStorage.getItem(TAB_BAR_MODE_KEY) as 'scroll' | 'wrap') ??
			'scroll'
	);

	const handleChange = (newMode: 'scroll' | 'wrap') => {
		setMode(newMode);
		window.localStorage.setItem(TAB_BAR_MODE_KEY, newMode);
		window.dispatchEvent(
			new CustomEvent(TAB_BAR_MODE_KEY, { detail: newMode })
		);
		void setTabBarMode(newMode);
	};

	return (
		<div className="grid gap-3 md:grid-cols-2">
			<Option
				active={mode === 'scroll'}
				label="单行滚动"
				description="所有标签页保持在一行，超出后通过横向滚动查看"
				onClick={() => handleChange('scroll')}
			/>
			<Option
				active={mode === 'wrap'}
				label="自动换行"
				description="标签页超出容器宽度后自动换行排列"
				onClick={() => handleChange('wrap')}
			/>
		</div>
	);
}

export function AppearanceSettings() {
	const { theme, setTheme, accent, accentMode, setAccent, setAccentMode } =
		useTheme();

	const sorted = [...PRESETS].sort((a, b) => {
		const aRgb = hexToRgb(a[0]),
			bRgb = hexToRgb(b[0]);
		return (
			rgbToHsl(aRgb.r, aRgb.g, aRgb.b).h - rgbToHsl(bRgb.r, bRgb.g, bRgb.b).h
		);
	});

	const isDefault = accentMode === 'default';
	const isSystem = accentMode === 'system';
	const isCustomFreeform =
		accentMode === 'custom' &&
		accent !== null &&
		!sorted.some(([hex]) => hex === accent);
	const selectedPreset = accentMode === 'custom' ? accent : null;

	return (
		<div className="space-y-4">
			<SettingsSectionCard title="标签页">
				<TabBarModeSetting />
			</SettingsSectionCard>

			<SettingsSectionCard title="主题模式">
				<div className="grid gap-3 md:grid-cols-3">
					<Option
						active={theme === 'system'}
						description="跟随当前设备或系统设置"
						label="跟随系统"
						onClick={() => setTheme('system')}
					/>
					<Option
						active={theme === 'light'}
						description="更适合明亮环境"
						label="浅色"
						onClick={() => setTheme('light')}
					/>
					<Option
						active={theme === 'dark'}
						description="适合夜间或长时间阅读"
						label="深色"
						onClick={() => setTheme('dark')}
					/>
				</div>
			</SettingsSectionCard>

			<SettingsSectionCard title="主题颜色">
				<div className="space-y-2.5">
					<div className="grid grid-cols-3 gap-2.5 md:grid-cols-4">
						<button
							type="button"
							className={cn(
								swatchCardCn(isSystem),
								'flex items-center gap-3 px-4 py-3'
							)}
							onClick={() => setAccentMode('system')}
						>
							<div
								className="h-9 w-9 shrink-0 rounded-lg"
								style={{ background: SYSTEM_SWATCH }}
							/>
							<span className="text-sm font-medium">跟随系统</span>
						</button>

						<button
							type="button"
							className={cn(
								swatchCardCn(isDefault),
								'flex items-center gap-3 px-4 py-3'
							)}
							onClick={() => setAccentMode('default')}
						>
							<div
								className="h-9 w-9 shrink-0 rounded-lg"
								style={{ background: DEFAULT_SWATCH }}
							/>
							<span className="text-sm font-medium">默认主题</span>
						</button>

						<label
							className={cn(
								swatchCardCn(isCustomFreeform),
								'relative cursor-pointer overflow-hidden'
							)}
						>
							<input
								type="color"
								className="sr-only"
								value={isCustomFreeform ? (accent ?? '#000000') : '#000000'}
								onChange={(e) => setAccent(e.target.value)}
							/>
							<div className="flex h-full items-center gap-3 px-4 py-3">
								<div
									className="relative h-9 w-9 shrink-0 rounded-lg"
									style={{
										background: isCustomFreeform
											? (accent ?? '')
											: CUSTOM_SWATCH,
									}}
								>
									{isCustomFreeform ? (
										<ActiveBadge />
									) : (
										<span
											className="absolute inset-0 flex items-center
												justify-center"
										>
											<span
												className="flex h-5 w-5 items-center justify-center
													rounded-full bg-white/80"
											>
												<Plus
													className="h-3 w-3 text-gray-800"
													strokeWidth={2.5}
												/>
											</span>
										</span>
									)}
								</div>
								<div>
									<div className="text-sm font-medium">自定义</div>
									{isCustomFreeform && (
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
								className={cn(
									swatchCardCn(selectedPreset === hex),
									'overflow-hidden'
								)}
							>
								<div className="flex h-full w-full flex-col">
									<div
										className="relative h-10 w-full"
										style={{ background: hex }}
									>
										{selectedPreset === hex && <ActiveBadge />}
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
				</div>
			</SettingsSectionCard>
		</div>
	);
}
