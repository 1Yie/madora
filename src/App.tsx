import { useLayoutEffect } from 'react';
import { RouterProvider } from 'react-router-dom';
import router from './router';
import { invoke } from '@tauri-apps/api/core';
import Titlebar from './components/system/top-bar';

function App() {
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

		initApp();
		return () => {
			if (!isDev) {
				document.removeEventListener('contextmenu', handler);
			}
		};
	}, []);

	return (
		<div className="flex h-screen flex-col bg-background text-foreground">
			<Titlebar />
			<div className="min-h-0 flex-1">
				<RouterProvider router={router} />
			</div>
		</div>
	);
}

export default App;
