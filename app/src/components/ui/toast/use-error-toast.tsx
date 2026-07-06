import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';

import { useNativeToast } from '@/components/ui/native-toast';

const ERROR_TOAST_DURATION_MS = 3000;

export function useErrorToast() {
	const { t } = useTranslation();
	const { showToast } = useNativeToast();

	return useCallback(
		(message: string) => {
			showToast({
				description: message,
				durationMs: ERROR_TOAST_DURATION_MS,
				title: t('common.feedback.error'),
				tone: 'error',
			});
		},
		[showToast, t]
	);
}
