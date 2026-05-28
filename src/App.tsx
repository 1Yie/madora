import { useLayoutEffect, useState } from 'react';
import { RouterProvider } from 'react-router-dom';
import router from './router';
import { invoke } from '@tauri-apps/api/core';
import {
	SetupWizard,
	shouldShowSetupWizard,
} from '@/components/system/setup-wizard';
import Titlebar from './components/system/top-bar';
import { useWindowResize } from '@/hooks/use-window-resize';

function App() {
	const [showSetupWizard, setShowSetupWizard] = useState(() =>
		shouldShowSetupWizard()
	);

	useWindowResize();

	useLayoutEffect(() => {
		const isDev = import.meta.env.DEV;
		const handler = (e: MouseEvent) => e.preventDefault();

		if (!isDev) {
			document.addEventListener('contextmenu', handler);
		}

		const initApp = async () => {
			try {
				await invoke('show_window');
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
			{showSetupWizard && (
				<SetupWizard onComplete={() => setShowSetupWizard(false)} />
			)}
			<div className="min-h-0 flex-1">
				<RouterProvider router={router} />
			</div>
		</div>
	);
}

export default App;
