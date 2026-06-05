import { useLayoutEffect, useState } from 'react';
import { showWindow } from '@/invoke/system';
import {
	SetupWizard,
	shouldShowSetupWizard,
} from '@/components/system/setup-wizard';
import { LicenseBanner } from '@/components/system/license-banner';
import Titlebar from './components/system/top-bar';
import { useWindowResize } from '@/hooks/use-window-resize';
import { useOverlayScrollbars } from '@/hooks/use-overlay-scrollbars';

import { MainLayout } from './layout';
function App() {
	const [showSetupWizard, setShowSetupWizard] = useState(() =>
		shouldShowSetupWizard()
	);

	useWindowResize();
	useOverlayScrollbars();

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
