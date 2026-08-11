import {
	Check,
	Plus,
	CornersOut as Maximize2,
	CornersIn as Minimize2,
	Scan as ScanLine,
} from '@phosphor-icons/react';
import { useState } from 'react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import {
	DEFAULT_EDITOR_FONT_SIZE,
	MAX_EDITOR_FONT_SIZE,
	MIN_EDITOR_FONT_SIZE,
	useAppSettings,
} from '@/context/app-settings-provider';
import { ZOOM_LEVELS, useWorkspace } from '@/context/workspace-provider';
import { useTheme } from '@/context/theme-provider';
import type { LocalePreference } from '@/i18n/locale';
import { ColorPicker } from '@/components/ui/color-picker';
import { Slider } from '@/components/ui/slider';
import {
	FieldBlock,
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
	['#7C3AED', 'settings.appearance.accentOptions.purple'],
	['#0EA5E9', 'settings.appearance.accentOptions.cyan'],
	['#EF4444', 'settings.appearance.accentOptions.red'],
	['#F59E0B', 'settings.appearance.accentOptions.amber'],
	['#10B981', 'settings.appearance.accentOptions.green'],
	['#6366F1', 'settings.appearance.accentOptions.indigo'],
];

function swatchCardCn(active: boolean) {
	return cn(
		'rounded-lg text-left transition-colors',
		active ? 'bg-primary/8' : 'text-muted-foreground hover:bg-muted/50'
	);
}

function ActiveBadge() {
	return (
		<span
			className="absolute bottom-1 right-1 flex h-4.5 w-4.5 items-center
				justify-center rounded-full bg-white/90"
		>
			<Check className="h-3 w-3 text-gray-800" weight="bold" />
		</span>
	);
}

const TAB_BAR_MODE_KEY = 'madora-tab-bar-mode';

function TabBarModeSetting() {
	const { t } = useTranslation();
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
				label={t('settings.appearance.tabBar.scroll.label')}
				description={t('settings.appearance.tabBar.scroll.description')}
				onClick={() => handleChange('scroll')}
			/>
			<Option
				active={mode === 'wrap'}
				label={t('settings.appearance.tabBar.wrap.label')}
				description={t('settings.appearance.tabBar.wrap.description')}
				onClick={() => handleChange('wrap')}
			/>
		</div>
	);
}

function LanguagePreferenceSetting() {
	const { t } = useTranslation();
	const { localePreference, setLocalePreference } = useAppSettings();
	const options: Array<{ label: string; value: LocalePreference }> = [
		{ label: t('language.options.system'), value: 'system' },
		{ label: t('language.options.zhCN'), value: 'zh-CN' },
		{ label: t('language.options.en'), value: 'en' },
		{ label: t('language.options.ja'), value: 'ja' },
		{ label: t('language.options.ko'), value: 'ko' },
	];

	return (
		<div className="grid gap-3 md:grid-cols-3">
			{options.map((option) => (
				<Option
					key={option.value}
					active={localePreference === option.value}
					label={option.label}
					onClick={() => setLocalePreference(option.value)}
				/>
			))}
		</div>
	);
}

function EditorTextSizeSetting() {
	const { t } = useTranslation();
	const { editorFontSize, setEditorFontSize } = useAppSettings();

	return (
		<FieldBlock label={t('settings.appearance.editorTextSize.label')}>
			<div className="flex items-center gap-3">
				<Slider
					className="flex-1"
					max={MAX_EDITOR_FONT_SIZE}
					min={MIN_EDITOR_FONT_SIZE}
					onValueChange={(next) => {
						const nextValue = Array.isArray(next) ? next[0] : next;
						setEditorFontSize(nextValue ?? DEFAULT_EDITOR_FONT_SIZE);
					}}
					step={1}
					value={[editorFontSize]}
				/>
				<span
					className="w-12 shrink-0 rounded-md border border-border bg-background
						px-2 py-1 text-center font-mono text-xs text-foreground"
				>
					{editorFontSize}px
				</span>
			</div>
			<div
				className="flex items-center justify-between font-mono text-[11px]
					text-muted-foreground"
			>
				<span>{MIN_EDITOR_FONT_SIZE}px</span>
				<span>{MAX_EDITOR_FONT_SIZE}px</span>
			</div>
		</FieldBlock>
	);
}

function ZoomLevelSetting() {
	const { t } = useTranslation();
	const { zoomLevel, setZoomLevel } = useWorkspace();

	const options: Array<{ label: string; value: number; icon: ReactNode }> = [
		{
			label: t('settings.appearance.zoomLevel.small'),
			value: ZOOM_LEVELS[0],
			icon: <Minimize2 className="size-4" />,
		},
		{
			label: t('settings.appearance.zoomLevel.medium'),
			value: ZOOM_LEVELS[1],
			icon: <ScanLine className="size-4" />,
		},
		{
			label: t('settings.appearance.zoomLevel.large'),
			value: ZOOM_LEVELS[2],
			icon: <Maximize2 className="size-4" />,
		},
	];

	return (
		<FieldBlock label={t('settings.appearance.zoomLevel.label')}>
			<div className="grid gap-2 md:grid-cols-3">
				{options.map((option) => (
					<Option
						key={option.value}
						active={Math.abs(zoomLevel - option.value) < 1e-9}
						icon={option.icon}
						label={`${option.label}\u00A0\u00B7\u00A0${Math.round(option.value * 100)}%`}
						onClick={() => setZoomLevel(option.value)}
					/>
				))}
			</div>
		</FieldBlock>
	);
}

export function AppearanceSettings() {
	const { t } = useTranslation();
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
			<SettingsSectionCard
				title={t('settings.appearance.cards.language.title')}
			>
				<LanguagePreferenceSetting />
			</SettingsSectionCard>

			<SettingsSectionCard title={t('settings.appearance.cards.tabs.title')}>
				<TabBarModeSetting />
			</SettingsSectionCard>

			<SettingsSectionCard title={t('settings.appearance.cards.editor.title')}>
				<div className="space-y-4">
					<EditorTextSizeSetting />
					<ZoomLevelSetting />
				</div>
			</SettingsSectionCard>

			<SettingsSectionCard title={t('settings.appearance.cards.theme.title')}>
				<div className="grid gap-3 md:grid-cols-3">
					<Option
						active={theme === 'system'}
						description={t('settings.appearance.theme.system.description')}
						label={t('settings.appearance.theme.system.label')}
						onClick={() => setTheme('system')}
					/>
					<Option
						active={theme === 'light'}
						description={t('settings.appearance.theme.light.description')}
						label={t('settings.appearance.theme.light.label')}
						onClick={() => setTheme('light')}
					/>
					<Option
						active={theme === 'dark'}
						description={t('settings.appearance.theme.dark.description')}
						label={t('settings.appearance.theme.dark.label')}
						onClick={() => setTheme('dark')}
					/>
				</div>
			</SettingsSectionCard>

			<SettingsSectionCard title={t('settings.appearance.cards.accent.title')}>
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
							<span className="text-sm font-medium">
								{t('settings.appearance.accentOptions.system')}
							</span>
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
							<span className="text-sm font-medium">
								{t('settings.appearance.accentOptions.default')}
							</span>
						</button>

						<ColorPicker
							ariaLabel={t('settings.appearance.accentOptions.custom')}
							className={cn(
								swatchCardCn(isCustomFreeform),
								'cursor-pointer overflow-hidden'
							)}
							onValueChange={setAccent}
							value={accent ?? sorted[0][0]}
						>
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
												<Plus className="h-3 w-3 text-gray-800" weight="bold" />
											</span>
										</span>
									)}
								</div>
								<div>
									<div className="text-sm font-medium">
										{t('settings.appearance.accentOptions.custom')}
									</div>
									{isCustomFreeform && (
										<div className="font-mono text-[11px] text-muted-foreground">
											{accent}
										</div>
									)}
								</div>
							</div>
						</ColorPicker>
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
										<div className="text-sm font-medium">{t(label)}</div>
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
