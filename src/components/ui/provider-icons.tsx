import type React from 'react';
import { Cog } from 'lucide-react';

import Anthropic from '@lobehub/icons/es/Anthropic';
import DeepSeek from '@lobehub/icons/es/DeepSeek';
import Kimi from '@lobehub/icons/es/Kimi';
import Minimax from '@lobehub/icons/es/Minimax';
import OpenAI from '@lobehub/icons/es/OpenAI';
import XiaomiMiMo from '@lobehub/icons/es/XiaomiMiMo';

export type ProviderIconProps = {
	className?: string;
	size?: number | string;
};

/**
 * DeepSeek — official brand icon from @lobehub/icons.
 */
export function DeepSeekIcon({ className, size }: ProviderIconProps) {
	return <DeepSeek className={className} size={size} />;
}

/**
 * OpenAI — official brand icon from @lobehub/icons.
 */
export function OpenAIIcon({ className, size }: ProviderIconProps) {
	return <OpenAI className={className} size={size} />;
}

/**
 * Anthropic — official brand icon from @lobehub/icons.
 */
export function AnthropicIcon({ className, size }: ProviderIconProps) {
	return <Anthropic className={className} size={size} />;
}

/**
 * Kimi — official brand icon from @lobehub/icons.
 */
export function KimiIcon({ className, size }: ProviderIconProps) {
	return <Kimi className={className} size={size} />;
}

/**
 * MiniMax — official brand icon from @lobehub/icons.
 */
export function MiniMaxIcon({ className, size }: ProviderIconProps) {
	return <Minimax className={className} size={size} />;
}

/**
 * Xiaomi MiMo — official brand icon from @lobehub/icons.
 */
export function MiMoIcon({ className, size }: ProviderIconProps) {
	return <XiaomiMiMo className={className} size={size} />;
}

/**
 * Custom — generic settings icon (no brand).
 */
export function CustomIcon({ className, size = '1em' }: ProviderIconProps) {
	return <Cog className={className} size={size} />;
}

/** Map provider key to its icon component. */
export const providerIconMap: Record<
	string,
	React.ComponentType<ProviderIconProps>
> = {
	deepseek: DeepSeekIcon,
	openai: OpenAIIcon,
	anthropic: AnthropicIcon,
	kimi: KimiIcon,
	minimax: MiniMaxIcon,
	mimo: MiMoIcon,
	'mimo-coding': MiMoIcon,
	custom: CustomIcon,
};
