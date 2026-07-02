import {
	Children,
	createElement,
	isValidElement,
	type ReactElement,
	type ReactNode,
} from 'react';
import { View } from 'react-native';
import Svg, { Defs, G, LinearGradient, Path, Stop } from 'react-native-svg';
import { Cog } from 'lucide-react-native';

import Anthropic from '@lobehub/icons/es/Anthropic/components/Mono';
import DeepSeek from '@lobehub/icons/es/DeepSeek/components/Mono';
import Gemini from '@lobehub/icons/es/Gemini/components/Mono';
import Kimi from '@lobehub/icons/es/Kimi/components/Mono';
import Minimax from '@lobehub/icons/es/Minimax/components/Mono';
import OpenAI from '@lobehub/icons/es/OpenAI/components/Mono';
import OpenCode from '@lobehub/icons/es/OpenCode/components/Mono';
import XiaomiMiMo from '@lobehub/icons/es/XiaomiMiMo/components/Mono';
import Zhipu from '@lobehub/icons/es/Zhipu/components/Mono';
import { useAppThemePalette } from '@/features/settings';

import type { AiProvider } from '../types';

type LobeIconComponent = {
	type: (props: { color?: string; size?: number | string }) => ReactElement;
};

type ProviderGlyphProps = {
	active?: boolean;
	provider: AiProvider;
	size?: number;
};

function asLobeIcon(icon: unknown): LobeIconComponent {
	return icon as LobeIconComponent;
}

const providerIconMap: Partial<Record<AiProvider, LobeIconComponent>> = {
	anthropic: asLobeIcon(Anthropic),
	deepseek: asLobeIcon(DeepSeek),
	google: asLobeIcon(Gemini),
	kimi: asLobeIcon(Kimi),
	minimax: asLobeIcon(Minimax),
	'minimax-coding': asLobeIcon(Minimax),
	mimo: asLobeIcon(XiaomiMiMo),
	'mimo-coding': asLobeIcon(XiaomiMiMo),
	openai: asLobeIcon(OpenAI),
	'opencode-go': asLobeIcon(OpenCode),
	'opencode-zen': asLobeIcon(OpenCode),
	zhipu: asLobeIcon(Zhipu),
	'zhipu-coding': asLobeIcon(Zhipu),
};

function normalizeSvgPropValue(value: unknown, color: string) {
	return value === 'currentColor' ? color : value;
}

function normalizeSvgProps(props: Record<string, unknown>, color: string) {
	const next: Record<string, unknown> = {};

	for (const [key, value] of Object.entries(props)) {
		if (
			key === 'children' ||
			key === 'className' ||
			key === 'style' ||
			key === 'xmlns'
		) {
			continue;
		}
		next[key] = normalizeSvgPropValue(value, color);
	}

	return next;
}

function renderSvgNode(
	node: ReactNode,
	color: string,
	key?: string
): ReactNode {
	if (node === null || node === undefined || typeof node === 'boolean') {
		return null;
	}
	if (typeof node === 'string' || typeof node === 'number') {
		return node;
	}
	if (!isValidElement(node)) {
		return null;
	}

	const element = node as ReactElement<{
		children?: ReactNode;
		[key: string]: unknown;
	}>;
	const children = Children.toArray(element.props.children).map(
		(child, index) => renderSvgNode(child, color, `${key ?? 'svg'}-${index}`)
	);
	const props = {
		key,
		...normalizeSvgProps(element.props, color),
		children,
	};

	switch (element.type) {
		case 'title':
			return null;
		case 'path':
			return createElement(Path as never, props);
		case 'g':
			return createElement(G as never, props);
		case 'defs':
			return createElement(Defs as never, props);
		case 'linearGradient':
			return createElement(LinearGradient as never, props);
		case 'stop':
			return createElement(Stop as never, props);
		default:
			return null;
	}
}

function LobeProviderIcon({
	color,
	icon,
	size,
}: {
	color: string;
	icon: LobeIconComponent;
	size: number;
}) {
	const element = icon.type({ color, size }) as ReactElement<{
		children?: ReactNode;
		viewBox?: string;
	}>;
	const children = Children.toArray(element.props.children).map(
		(child, index) => renderSvgNode(child, color, `provider-icon-${index}`)
	);

	return (
		<Svg
			color={color}
			fill={color}
			height={size}
			viewBox={element.props.viewBox ?? '0 0 24 24'}
			width={size}
		>
			{children}
		</Svg>
	);
}

export function ProviderGlyph({
	active = false,
	provider,
	size = 30,
}: ProviderGlyphProps) {
	const palette = useAppThemePalette();
	const Icon = providerIconMap[provider];
	const backgroundColor = active ? palette.accentSurface : palette.surfaceMuted;
	const foregroundColor = active ? palette.accentForeground : palette.icon;

	return (
		<View
			className="items-center justify-center rounded-full"
			style={{
				backgroundColor,
				height: size,
				width: size,
			}}
		>
			{Icon ? (
				<LobeProviderIcon
					color={foregroundColor}
					icon={Icon}
					size={size * 0.58}
				/>
			) : (
				<Cog color={foregroundColor} size={size * 0.52} strokeWidth={2.2} />
			)}
		</View>
	);
}
