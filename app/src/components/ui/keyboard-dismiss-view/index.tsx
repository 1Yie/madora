import type { ReactNode } from 'react';
import {
	Keyboard,
	View,
	type GestureResponderEvent,
	type ViewProps,
} from 'react-native';

type KeyboardDismissViewProps = ViewProps & {
	children: ReactNode;
};

export function KeyboardDismissView({
	children,
	onStartShouldSetResponderCapture,
	...props
}: KeyboardDismissViewProps) {
	const handleStartShouldSetResponderCapture = (
		event: GestureResponderEvent
	) => {
		const shouldBecomeResponder =
			onStartShouldSetResponderCapture?.(event) ?? false;

		if (event.target === event.currentTarget) {
			Keyboard.dismiss();
		}

		return shouldBecomeResponder;
	};

	return (
		<View
			{...props}
			onStartShouldSetResponderCapture={handleStartShouldSetResponderCapture}
		>
			{children}
		</View>
	);
}
