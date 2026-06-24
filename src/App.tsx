import { useEffect, useLayoutEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { showWindow } from '@/invoke/system';
import { getAppInfo } from '@/invoke/app';
import {
	SetupWizard,
	shouldShowSetupWizard,
} from '@/components/system/setup-wizard';
import { LicenseBanner } from '@/components/system/license-banner';
import { checkForAppUpdate } from '@/lib/update-check';
import { showUpdateAvailableToast } from '@/lib/update-toast';
import Titlebar from './components/system/top-bar';
import { useWindowResize } from '@/hooks/use-window-resize';
import { useZoomShortcuts } from '@/hooks/use-zoom-shortcuts';
import { useOverlayScrollbars } from '@/hooks/use-overlay-scrollbars';
import packageJson from '../package.json';

import { MainLayout } from './layout';

let hasRunStartupUpdateCheck = false;

function App() {
	const { t } = useTranslation();
	const [showSetupWizard, setShowSetupWizard] = useState(() =>
		shouldShowSetupWizard()
	);

	useWindowResize();
	useOverlayScrollbars();
	useZoomShortcuts();

	useLayoutEffect(() => {
		const isDev = import.meta.env.DEV;
		const handler = (e: MouseEvent) => e.preventDefault();

		if (!isDev) {
			document.addEventListener('contextmenu', handler);
		}

		const initApp = async () => {
			try {
				await showWindow();
			} catch (error) {
				console.error('Window show failed:', error);
			}
		};

		void initApp();

		return () => {
			if (!isDev) {
				document.removeEventListener('contextmenu', handler);
			}
		};
	}, []);

	useEffect(() => {
		if (hasRunStartupUpdateCheck) {
			return;
		}

		hasRunStartupUpdateCheck = true;
		let active = true;

		void (async () => {
			try {
				const appInfo = await getAppInfo().catch(() => null);
				const updateInfo = await checkForAppUpdate(
					appInfo?.version ?? packageJson.version
				);

				if (active && updateInfo.updateAvailable) {
					showUpdateAvailableToast(updateInfo, t);
				}
			} catch (error) {
				console.error('Update check failed:', error);
			}
		})();

		return () => {
			active = false;
		};
	}, [t]);

	return (
		<div className="flex h-screen flex-col bg-background text-foreground">
			<Titlebar />
			<LicenseBanner />
			{showSetupWizard && (
				<SetupWizard onComplete={() => setShowSetupWizard(false)} />
			)}
			<div className="min-h-0 flex-1">
				<MainLayout />
			</div>
		</div>
	);
}

export default App;
