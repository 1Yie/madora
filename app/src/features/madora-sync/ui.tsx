import { Badge, BadgeText } from '@/components/ui/badge';
import { Button, ButtonText } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Heading } from '@/components/ui/heading';
import { Input, InputField } from '@/components/ui/input';
import { Text } from '@/components/ui/text';
import { Textarea, TextareaInput } from '@/components/ui/textarea';
import { VStack } from '@/components/ui/vstack';
import { View, type ViewProps } from 'react-native';

import type { SyncConnectionState } from './types';

function cx(...parts: (string | false | null | undefined)[]) {
	return parts.filter(Boolean).join(' ');
}

export function Panel({
	className,
	...props
}: ViewProps & { className?: string }) {
	return (
		<Card
			size="sm"
			className={cx('gap-4', className)}
			{...(props as React.ComponentProps<typeof Card>)}
		/>
	);
}

export function SectionHeading({
	eyebrow,
	title,
	detail,
}: {
	eyebrow: string;
	title: string;
	detail?: string;
}) {
	return (
		<VStack className="gap-1">
			<Text
				size="xs"
				className="uppercase tracking-[0.6px] text-muted-foreground"
			>
				{eyebrow}
			</Text>
			<Heading size="xl" className="text-foreground">
				{title}
			</Heading>
			{detail ? (
				<Text size="sm" className="leading-5 text-muted-foreground">
					{detail}
				</Text>
			) : null}
		</VStack>
	);
}

export function StatusPill({
	state,
	label,
}: {
	state: SyncConnectionState | 'pending' | 'synced' | 'trusted' | 'idle' | 'ai';
	label?: string;
}) {
	const tone = (() => {
		switch (state) {
			case 'connected':
			case 'synced':
			case 'trusted':
				return 'border-emerald-500/35 bg-emerald-500/12';
			case 'syncing':
			case 'connecting':
			case 'authenticating':
			case 'ai':
				return 'border-sky-500/35 bg-sky-500/12';
			case 'discovering':
			case 'pending':
				return 'border-amber-500/35 bg-amber-500/12';
			case 'disconnected':
				return 'border-zinc-500/35 bg-zinc-500/12';
			case 'idle':
			default:
				return '';
		}
	})();

	const textTone = (() => {
		switch (state) {
			case 'connected':
			case 'synced':
			case 'trusted':
				return 'text-emerald-500';
			case 'syncing':
			case 'connecting':
			case 'authenticating':
			case 'ai':
				return 'text-sky-500';
			case 'discovering':
			case 'pending':
				return 'text-amber-500';
			case 'disconnected':
				return 'text-zinc-400';
			case 'idle':
			default:
				return 'text-muted-foreground';
		}
	})();

	return (
		<Badge variant="outline" className={cx('rounded-md', tone)}>
			<BadgeText className={cx('tracking-[0.4px]', textTone)}>
				{label ?? state}
			</BadgeText>
		</Badge>
	);
}

export function ActionButton({
	label,
	variant = 'primary',
	onPress,
	disabled,
}: {
	label: string;
	variant?: 'primary' | 'secondary' | 'ghost';
	onPress?: () => void;
	disabled?: boolean;
}) {
	const buttonVariant =
		variant === 'primary'
			? 'default'
			: variant === 'secondary'
				? 'secondary'
				: 'ghost';

	return (
		<Button
			variant={buttonVariant}
			onPress={onPress}
			isDisabled={disabled}
			className="flex-1"
		>
			<ButtonText>{label}</ButtonText>
		</Button>
	);
}

export function MetricTile({
	label,
	value,
	tone = 'default',
}: {
	label: string;
	value: string;
	tone?: 'default' | 'accent' | 'warm';
}) {
	return (
		<Card
			size="sm"
			className={cx(
				'min-h-[84px] flex-1',
				tone === 'accent' && 'border-sky-500/30 bg-sky-500/10',
				tone === 'warm' && 'border-amber-500/30 bg-amber-500/10'
			)}
		>
			<Text
				size="xs"
				className="uppercase tracking-[0.4px] text-muted-foreground"
			>
				{label}
			</Text>
			<Text size="xl" bold className="mt-2 text-foreground">
				{value}
			</Text>
		</Card>
	);
}

export function Field({
	multiline,
	className,
	...props
}: React.ComponentProps<typeof InputField> & {
	multiline?: boolean;
	className?: string;
}) {
	if (multiline) {
		return (
			<Textarea className={cx('min-h-[120px]', className)} size="md">
				<TextareaInput {...props} textAlignVertical="top" />
			</Textarea>
		);
	}

	return (
		<Input className={className}>
			<InputField {...props} />
		</Input>
	);
}

const CONNECTION_STATES: SyncConnectionState[] = [
	'disconnected',
	'discovering',
	'connecting',
	'authenticating',
	'syncing',
	'connected',
];

export function ConnectionTimeline({ state }: { state: SyncConnectionState }) {
	const activeIndex = CONNECTION_STATES.indexOf(state);

	return (
		<VStack className="gap-2">
			<Text
				size="xs"
				className="uppercase tracking-[0.4px] text-muted-foreground"
			>
				State
			</Text>
			<View className="flex-row flex-wrap gap-2">
				{CONNECTION_STATES.map((item, index) => {
					const active = index <= activeIndex;
					const current = item === state;
					return (
						<Badge
							key={item}
							variant="outline"
							className={cx(
								'rounded-md',
								current && 'border-sky-500/35 bg-sky-500/12',
								!current && active && 'border-emerald-500/30 bg-emerald-500/10'
							)}
						>
							<BadgeText
								className={cx(
									'tracking-[0.4px]',
									active ? 'text-foreground' : 'text-muted-foreground'
								)}
							>
								{item}
							</BadgeText>
						</Badge>
					);
				})}
			</View>
		</VStack>
	);
}

const QR_PATTERN = [
	'1110110',
	'1000100',
	'1011101',
	'0010111',
	'1110001',
	'1001110',
	'1100101',
];

export function QrPreview({ active }: { active: boolean }) {
	return (
		<View
			className={cx(
				'h-[132px] w-[132px] rounded-lg border p-3',
				active
					? 'border-emerald-500/35 bg-emerald-500/10'
					: 'border-border bg-secondary'
			)}
		>
			<View className="flex-1 flex-row flex-wrap">
				{QR_PATTERN.join('')
					.split('')
					.map((cell, index) => (
						<View
							key={index}
							className={cx(
								'h-[14.285%] w-[14.285%] p-[1px]',
								cell === '1' ? '' : ''
							)}
						>
							<View
								className={cx(
									'h-full w-full rounded-[2px]',
									cell === '1' ? 'bg-foreground' : 'bg-transparent'
								)}
							/>
						</View>
					))}
			</View>
		</View>
	);
}
