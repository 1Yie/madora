'use client';

import React from 'react';
import { Pressable } from 'react-native';
import Animated, {
	interpolateColor,
	useAnimatedStyle,
	useSharedValue,
	withTiming,
} from 'react-native-reanimated';
import { useResolvedThemePreference } from '@/features/settings';

type SwitchSize = 'sm' | 'md' | 'lg';

type SwitchProps = {
	className?: string;
	disabled?: boolean;
	onValueChange?: (value: boolean) => void;
	size?: SwitchSize;
	value?: boolean;
};

const SIZE_CONFIG: Record<
	SwitchSize,
	{ inset: number; thumb: number; trackHeight: number; trackWidth: number }
> = {
	sm: {
		inset: 3,
		thumb: 16,
		trackHeight: 22,
		trackWidth: 36,
	},
	md: {
		inset: 3,
		thumb: 18,
		trackHeight: 24,
		trackWidth: 40,
	},
	lg: {
		inset: 3,
		thumb: 22,
		trackHeight: 26,
		trackWidth: 44,
	},
};

const Switch = React.forwardRef<
	React.ComponentRef<typeof Pressable>,
	SwitchProps
>(function Switch(
	{ className, disabled = false, onValueChange, size = 'md', value = false },
	ref
) {
	const resolvedTheme = useResolvedThemePreference();
	const config = SIZE_CONFIG[size];
	const translateX = config.trackWidth - config.thumb - config.inset * 2;
	const progress = useSharedValue(value ? 1 : 0);
	const trackOffColor =
		resolvedTheme === 'dark' ? 'rgba(255, 255, 255, 0.16)' : '#e4e4e7';
	const trackOnColor = resolvedTheme === 'dark' ? '#f5f5f5' : '#18181b';
	const trackDisabledColor =
		resolvedTheme === 'dark' ? 'rgba(255, 255, 255, 0.1)' : '#ececf1';
	const thumbOffColor = resolvedTheme === 'dark' ? '#fafafa' : '#ffffff';
	const thumbOnColor = resolvedTheme === 'dark' ? '#0a0a0a' : '#ffffff';
	const thumbDisabledColor =
		resolvedTheme === 'dark' ? 'rgba(255, 255, 255, 0.7)' : '#f7f7fa';

	React.useEffect(() => {
		progress.value = withTiming(value ? 1 : 0, { duration: 180 });
	}, [progress, value]);

	const trackAnimatedStyle = useAnimatedStyle(() => {
		const backgroundColor = disabled
			? trackDisabledColor
			: interpolateColor(progress.value, [0, 1], [trackOffColor, trackOnColor]);

		return {
			backgroundColor,
		};
	}, [disabled, trackDisabledColor, trackOffColor, trackOnColor]);

	const thumbAnimatedStyle = useAnimatedStyle(() => {
		const backgroundColor = disabled
			? thumbDisabledColor
			: interpolateColor(progress.value, [0, 1], [thumbOffColor, thumbOnColor]);

		return {
			backgroundColor,
			transform: [
				{
					translateX: progress.value * translateX,
				},
			],
		};
	}, [disabled, thumbDisabledColor, thumbOffColor, thumbOnColor, translateX]);

	return (
		<Pressable
			ref={ref}
			accessibilityRole="switch"
			accessibilityState={{ checked: value, disabled }}
			className={className}
			data-disabled={disabled}
			disabled={disabled}
			hitSlop={8}
			onPress={() => onValueChange?.(!value)}
			style={{
				height: config.trackHeight,
				justifyContent: 'center',
				opacity: disabled ? 0.4 : 1,
				width: config.trackWidth,
			}}
		>
			<Animated.View
				style={[
					trackAnimatedStyle,
					{
						borderRadius: config.trackHeight / 2,
						height: config.trackHeight,
						position: 'relative',
						width: config.trackWidth,
					},
				]}
			>
				<Animated.View
					style={[
						thumbAnimatedStyle,
						{
							borderRadius: config.thumb / 2,
							height: config.thumb,
							left: config.inset,
							position: 'absolute',
							top: (config.trackHeight - config.thumb) / 2,
							width: config.thumb,
						},
					]}
				/>
			</Animated.View>
		</Pressable>
	);
});

Switch.displayName = 'Switch';

export { Switch };
