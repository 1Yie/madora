import type { ReactNode } from 'react';
import {
	KeyboardAvoidingView,
	Modal,
	Platform,
	Pressable,
	Text,
	TextInput,
	type TextInputProps,
	View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { KeyboardDismissView } from '@/components/ui/keyboard-dismiss-view';
import { NativeToastViewport } from '@/components/ui/native-toast';
import { useAppThemePalette } from '@/features/settings';

type NativeModalProps = {
	children: ReactNode;
	closeOnBackdrop?: boolean;
	footer?: ReactNode;
	isOpen: boolean;
	onClose: () => void;
	title: string;
};

export function NativeModal({
	children,
	closeOnBackdrop = true,
	footer,
	isOpen,
	onClose,
	title,
}: NativeModalProps) {
	const insets = useSafeAreaInsets();
	const palette = useAppThemePalette();

	return (
		<Modal
			animationType="fade"
			onRequestClose={onClose}
			presentationStyle="overFullScreen"
			statusBarTranslucent
			transparent
			visible={isOpen}
		>
			<Pressable
				accessibilityLabel={title}
				className="absolute inset-0"
				onPress={closeOnBackdrop ? onClose : undefined}
				style={{ backgroundColor: 'rgba(0, 0, 0, 0.52)' }}
			/>
			<KeyboardAvoidingView
				behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
				keyboardVerticalOffset={Math.max(insets.top, 0)}
				pointerEvents="box-none"
				style={{
					flex: 1,
					justifyContent: 'center',
					paddingBottom: insets.bottom + 16,
					paddingHorizontal: 20,
					paddingTop: insets.top + 16,
				}}
			>
				<KeyboardDismissView
					className="overflow-hidden rounded-xl border px-4 py-4"
					style={{
						alignSelf: 'center',
						backgroundColor: palette.surface,
						borderColor: palette.border,
						elevation: 24,
						maxWidth: 392,
						shadowColor: '#000',
						shadowOffset: { height: 14, width: 0 },
						shadowOpacity: 0.34,
						shadowRadius: 30,
						width: '100%',
					}}
				>
					<Text
						className="mb-4 text-[16px] font-semibold"
						numberOfLines={1}
						style={{ color: palette.foreground }}
					>
						{title}
					</Text>
					<View className={footer ? 'mb-5' : undefined}>{children}</View>
					{footer ? (
						<View className="flex-row justify-end gap-2">{footer}</View>
					) : null}
				</KeyboardDismissView>
				<NativeToastViewport />
			</KeyboardAvoidingView>
		</Modal>
	);
}

export function NativeModalTextInput(props: TextInputProps) {
	const palette = useAppThemePalette();

	return (
		<TextInput
			placeholderTextColor={palette.mutedForeground}
			selectionColor={palette.accentSurface}
			{...props}
			className="min-h-10 rounded-md border px-3 text-[14px]"
			style={[
				{
					backgroundColor: palette.surfaceMuted,
					borderColor: palette.border,
					color: palette.foreground,
				},
				props.style,
			]}
		/>
	);
}

export function NativeModalActions({
	cancelLabel,
	confirmLabel,
	destructive = false,
	onCancel,
	onConfirm,
}: {
	cancelLabel: string;
	confirmLabel: string;
	destructive?: boolean;
	onCancel: () => void;
	onConfirm: () => void;
}) {
	return (
		<>
			<NativeModalAction
				label={cancelLabel}
				onPress={onCancel}
				variant="outline"
			/>
			<NativeModalAction
				label={confirmLabel}
				onPress={onConfirm}
				variant={destructive ? 'destructive' : 'primary'}
			/>
		</>
	);
}

function NativeModalAction({
	label,
	onPress,
	variant,
}: {
	label: string;
	onPress: () => void;
	variant: 'destructive' | 'outline' | 'primary';
}) {
	const palette = useAppThemePalette();
	const destructiveColor = '#dc2626';
	const isOutline = variant === 'outline';
	const isDestructive = variant === 'destructive';
	const backgroundColor = isOutline
		? 'transparent'
		: isDestructive
			? destructiveColor
			: palette.accentSurface;
	const borderColor = isOutline ? palette.border : backgroundColor;
	const textColor = isOutline
		? palette.foreground
		: isDestructive
			? '#ffffff'
			: palette.accentForeground;

	return (
		<Pressable
			accessibilityLabel={label}
			onPress={onPress}
			className="min-h-10 items-center justify-center rounded-md border px-4"
			style={{ backgroundColor, borderColor }}
		>
			<Text className="text-[14px] font-semibold" style={{ color: textColor }}>
				{label}
			</Text>
		</Pressable>
	);
}
