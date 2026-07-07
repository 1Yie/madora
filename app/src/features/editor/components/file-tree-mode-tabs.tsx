import { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import Animated, {
	Easing,
	useAnimatedStyle,
	useSharedValue,
	withTiming,
} from 'react-native-reanimated';

import { useAppThemePalette } from '@/features/settings';

export type WorkspaceMode = 'local' | 'remote';

const FILE_TREE_MODE_TABS: {
	fallbackLabel: string;
	labelKey: 'fileTree.tabs.local' | 'fileTree.tabs.remote';
	value: WorkspaceMode;
}[] = [
	{
		fallbackLabel: '本地文件夹',
		labelKey: 'fileTree.tabs.local',
		value: 'local',
	},
	{
		fallbackLabel: '远程文件夹',
		labelKey: 'fileTree.tabs.remote',
		value: 'remote',
	},
];

export function FileTreeModeTabs({
	disabled = false,
	pendingValue = null,
	showRemote = true,
	value,
	onValueChange,
}: {
	disabled?: boolean;
	pendingValue?: WorkspaceMode | null;
	showRemote?: boolean;
	value: WorkspaceMode;
	onValueChange: (mode: WorkspaceMode) => void;
}) {
	const { t } = useTranslation();
	const palette = useAppThemePalette();
	const displayValue = pendingValue ?? value;
	const [containerWidth, setContainerWidth] = useState(0);

	const activeIndex = FILE_TREE_MODE_TABS.findIndex(
		(tab) => tab.value === displayValue
	);

	const activeIndexShared = useSharedValue(activeIndex);

	useEffect(() => {
		activeIndexShared.value = withTiming(activeIndex, {
			duration: 200,
			easing: Easing.out(Easing.quad),
		});
	}, [activeIndex, activeIndexShared]);

	const animatedStyle = useAnimatedStyle(() => {
		if (containerWidth === 0) {
			return { opacity: 0 };
		}
		const tabWidth = (containerWidth - 12) / 2;
		const translateX = activeIndexShared.value * (tabWidth + 4);
		return {
			position: 'absolute',
			left: 4,
			width: tabWidth,
			top: 4,
			bottom: 4,
			transform: [{ translateX }],
			opacity: 1,
		};
	});

	if (!showRemote) {
		return null;
	}

	return (
		<View className="px-4 pt-3 pb-1">
			<View
				accessibilityRole="tablist"
				className="flex-row items-center gap-1 rounded-lg p-1 relative"
				style={{ backgroundColor: palette.surfaceMuted }}
				onLayout={(e) => setContainerWidth(e.nativeEvent.layout.width)}
			>
				{containerWidth > 0 && (
					<Animated.View
						pointerEvents="none"
						className="rounded-md"
						style={[animatedStyle, { backgroundColor: palette.accentSurface }]}
					/>
				)}

				{FILE_TREE_MODE_TABS.map((tab) => (
					<FileTreeModeTabButton
						key={tab.value}
						active={displayValue === tab.value}
						staticActive={containerWidth === 0 && displayValue === tab.value}
						disabled={disabled || Boolean(pendingValue)}
						label={t(tab.labelKey, tab.fallbackLabel)}
						onPress={() => onValueChange(tab.value)}
					/>
				))}
			</View>
		</View>
	);
}

function FileTreeModeTabButton({
	active,
	staticActive,
	disabled,
	label,
	onPress,
}: {
	active: boolean;
	staticActive: boolean;
	disabled: boolean;
	label: string;
	onPress: () => void;
}) {
	const palette = useAppThemePalette();
	const foregroundColor = active
		? palette.accentForeground
		: palette.mutedForeground;

	return (
		<Pressable
			accessibilityRole="tab"
			accessibilityState={{ disabled, selected: active }}
			disabled={disabled || active}
			onPress={onPress}
			className="min-h-8 flex-1 items-center justify-center rounded-md px-3
				z-10"
			style={{
				backgroundColor: staticActive ? palette.accentSurface : 'transparent',
			}}
		>
			<Text
				className="text-[13px] font-semibold"
				numberOfLines={1}
				style={{ color: foregroundColor }}
			>
				{label}
			</Text>
		</Pressable>
	);
}
