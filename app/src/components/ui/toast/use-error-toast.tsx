import { useCallback } from 'react';

import { useNativeToast } from '@/components/ui/native-toast';

const ERROR_TOAST_DURATION_MS = 3000;

export function useErrorToast() {
	const { showToast } = useNativeToast();

	return useCallback(
		(message: string) => {
			showToast({
				description: message,
				durationMs: ERROR_TOAST_DURATION_MS,
				title: 'Error',
				tone: 'error',
			});
		},
		[showToast]
	);
}
