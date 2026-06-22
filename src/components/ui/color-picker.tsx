'use client';

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import { Popover, PopoverPopup, PopoverTrigger } from '@/components/ui/popover';
import { Slider } from '@/components/ui/slider';

type ColorPickerProps = {
	ariaLabel?: string;
	children: ReactNode;
	className?: string;
	disabled?: boolean;
	onValueChange: (value: string) => void;
	value: string;
	swatches?: string[];
};

type RgbColor = {
	b: number;
	g: number;
	r: number;
};

const CHANNELS: Array<{ key: keyof RgbColor; label: string }> = [
	{ key: 'r', label: 'R' },
	{ key: 'g', label: 'G' },
	{ key: 'b', label: 'B' },
];

function clampChannel(value: number) {
	return Math.min(255, Math.max(0, Math.round(value)));
}

function normalizeHexColor(value: string | null | undefined): string | null {
	if (!value) return null;

	const trimmed = value.trim();
	if (!/^#(?:[\dA-Fa-f]{3}|[\dA-Fa-f]{6})$/.test(trimmed)) {
		return null;
	}

	if (trimmed.length === 4) {
		return `#${trimmed[1]}${trimmed[1]}${trimmed[2]}${trimmed[2]}${trimmed[3]}${trimmed[3]}`.toUpperCase();
	}

	return trimmed.toUpperCase();
}

function sanitizeHexDraft(value: string) {
	const body = value
		.toUpperCase()
		.replace(/[^\dA-F#]/g, '')
		.replace(/#/g, '');
	return `#${body.slice(0, 6)}`;
}

function hexToRgb(hex: string): RgbColor {
	const normalized = normalizeHexColor(hex) ?? '#000000';
	const raw = normalized.slice(1);

	return {
		b: parseInt(raw.slice(4, 6), 16),
		g: parseInt(raw.slice(2, 4), 16),
		r: parseInt(raw.slice(0, 2), 16),
	};
}

function rgbToHex({ r, g, b }: RgbColor) {
	return `#${[r, g, b]
		.map((channel) => clampChannel(channel).toString(16).padStart(2, '0'))
		.join('')}`.toUpperCase();
}

export function ColorPicker({
	ariaLabel,
	children,
	className,
	disabled,
	onValueChange,
	value,
	swatches = [],
}: ColorPickerProps) {
	const normalizedValue = useMemo(
		() => normalizeHexColor(value) ?? '#7C3AED',
		[value]
	);
	const [hexDraft, setHexDraft] = useState(normalizedValue);

	useEffect(() => {
		setHexDraft(normalizedValue);
	}, [normalizedValue]);

	const rgb = useMemo(() => hexToRgb(normalizedValue), [normalizedValue]);
	const normalizedSwatches = useMemo(
		() =>
			swatches
				.map((swatch) => normalizeHexColor(swatch))
				.filter((swatch): swatch is string => Boolean(swatch)),
		[swatches]
	);

	const updateHex = (nextValue: string) => {
		const next = normalizeHexColor(nextValue);
		if (!next) return;
		setHexDraft(next);
		onValueChange(next);
	};

	const updateChannel = (channel: keyof RgbColor, nextValue: number) => {
		const nextHex = rgbToHex({
			...rgb,
			[channel]: clampChannel(nextValue),
		});
		setHexDraft(nextHex);
		onValueChange(nextHex);
	};

	return (
		<Popover>
			<PopoverTrigger
				aria-label={ariaLabel}
				className={cn(
					`outline-none focus-visible:ring-2 focus-visible:ring-ring
					focus-visible:ring-offset-2 focus-visible:ring-offset-background`,
					className
				)}
				disabled={disabled}
			>
				{children}
			</PopoverTrigger>
			<PopoverPopup align="start" className="w-76">
				<div className="space-y-4">
					<div className="flex items-start gap-3">
						<div
							className="size-16 shrink-0 rounded-xl border border-border
								shadow-xs/5"
							style={{ background: normalizedValue }}
						/>
						<div className="min-w-0 flex-1 space-y-1.5">
							<div className="space-y-0.5">
								<div className="text-sm font-medium text-foreground">Hex</div>
								<div className="text-xs text-muted-foreground">
									{normalizedValue}
								</div>
							</div>
							<Input
								autoCapitalize="characters"
								className="font-mono uppercase"
								maxLength={7}
								nativeInput
								onBlur={() => setHexDraft(normalizedValue)}
								onChange={(event) => {
									const nextDraft = sanitizeHexDraft(event.target.value);
									setHexDraft(nextDraft);
									const next = normalizeHexColor(nextDraft);
									if (next) {
										onValueChange(next);
									}
								}}
								spellCheck={false}
								value={hexDraft}
							/>
						</div>
					</div>

					{normalizedSwatches.length > 0 && (
						<div className="grid grid-cols-6 gap-2">
							{normalizedSwatches.map((swatch) => (
								<button
									key={swatch}
									className={cn(
										`relative h-8 rounded-lg border border-border shadow-xs/5
										outline-none transition-transform hover:scale-103
										focus-visible:ring-2 focus-visible:ring-ring
										focus-visible:ring-offset-2
										focus-visible:ring-offset-background`,
										normalizedValue === swatch &&
											'ring-2 ring-ring ring-offset-2 ring-offset-background'
									)}
									onClick={() => updateHex(swatch)}
									style={{ background: swatch }}
									type="button"
								/>
							))}
						</div>
					)}

					<div className="space-y-3">
						{CHANNELS.map((channel) => (
							<div key={channel.key} className="space-y-1.5">
								<div className="flex items-center justify-between gap-3">
									<span className="text-xs font-medium text-foreground">
										{channel.label}
									</span>
									<span className="font-mono text-[11px] text-muted-foreground">
										{rgb[channel.key]}
									</span>
								</div>
								<Slider
									max={255}
									min={0}
									onValueChange={(next) => {
										const nextValue = Array.isArray(next) ? next[0] : next;
										updateChannel(channel.key, nextValue ?? 0);
									}}
									value={[rgb[channel.key]]}
								/>
							</div>
						))}
					</div>
				</div>
			</PopoverPopup>
		</Popover>
	);
}
