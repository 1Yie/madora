import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Toast, ToastDescription, useToast } from './';

/**
 * Show an error toast anchored to the top of the screen, respecting the
 * status-bar safe-area inset so it isn't hidden behind the notch / status bar.
 */
export function useErrorToast() {
	const toast = useToast();
	const insets = useSafeAreaInsets();

	return (message: string) => {
		toast.show({
			placement: 'top',
			duration: 3000,
			containerStyle: { marginTop: Math.max(insets.top, 8) },
			render: () => (
				<Toast action="error" variant="solid">
					<ToastDescription className="text-destructive">
						{message}
					</ToastDescription>
				</Toast>
			),
		});
	};
}
