import type { TFunction } from 'i18next';
import {
	showErrorToast,
	showSuccessToast,
	toastManager,
} from '@/components/ui/toast';
import { openUrl } from '@/invoke/opener';
import type { AppUpdateInfo } from '@/lib/update-check';

function getErrorMessage(error: unknown, fallback: string): string {
	if (error instanceof Error) {
		return error.message;
	}

	if (typeof error === 'string') {
		return error;
	}

	return fallback;
}

async function openReleasePage(url: string, t: TFunction): Promise<void> {
	try {
		await openUrl(url);
	} catch (error) {
		showErrorToast(
			t('errors.openLinkFailed'),
			getErrorMessage(error, t('settings.about.toasts.checkFailedDescription'))
		);
	}
}

export function showUpdateAvailableToast(
	updateInfo: AppUpdateInfo,
	t: TFunction
): string {
	toastManager.close();
	return toastManager.add({
		actionProps: {
			children: t('settings.about.actions.viewRelease'),
			onClick: () => {
				void openReleasePage(updateInfo.releaseUrl, t);
			},
		},
		description: t('settings.about.toasts.updateAvailableDescription', {
			currentVersion: updateInfo.currentVersion,
			latestVersion: updateInfo.latestVersion,
		}),
		priority: 'low',
		title: t('settings.about.toasts.updateAvailableTitle'),
		type: 'success',
	});
}

export function showUpdateCheckErrorToast(
	error: unknown,
	t: TFunction
): string {
	return showErrorToast(
		t('settings.about.toasts.checkFailed'),
		getErrorMessage(error, t('settings.about.toasts.checkFailedDescription'))
	);
}

export function showUpToDateToast(version: string, t: TFunction): string {
	return showSuccessToast(t('settings.about.toasts.upToDate', { version }));
}
