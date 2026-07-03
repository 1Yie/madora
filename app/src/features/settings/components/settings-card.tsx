import type { ReactNode } from 'react';
import { Text, View } from 'react-native';

import { useAppThemePalette } from '../providers/app-settings-provider';

export function SettingsCard({
	children,
	detail,
	icon,
	title,
}: {
	children?: ReactNode;
	detail?: string;
	icon?: ReactNode;
	title?: string;
}) {
	const palette = useAppThemePalette();

	return (
		<View
			className="gap-3 rounded-lg p-4"
			style={{
				backgroundColor: palette.surface,
				borderColor: palette.border,
				borderWidth: 1,
			}}
		>
			{title || detail || icon ? (
				<View className="flex-row items-start gap-3">
					{icon ? (
						<View
							className="h-9 w-9 items-center justify-center rounded-full"
							style={{ backgroundColor: palette.surfaceMuted }}
						>
							{icon}
						</View>
					) : null}
					<View className="flex-1 gap-1">
						{title ? (
							<Text className="text-[16px] font-semibold text-foreground">
								{title}
							</Text>
						) : null}
						{detail ? (
							<Text className="text-[13px] leading-5 text-muted-foreground">
								{detail}
							</Text>
						) : null}
					</View>
				</View>
			) : null}
			{children}
		</View>
	);
}
