import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { AiSettingsProvider } from './components/system/ai-settings-provider';
import { AppSettingsProvider } from './components/system/app-settings-provider';
import { LicenseProvider } from './components/system/license-provider';
import { ProseThemeProvider } from './components/system/prose-theme-provider';
import { ThemeProvider } from './components/system/theme-provider';
import { ToastProvider } from './components/ui/toast';
import './index.css';

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
	<React.StrictMode>
		<ThemeProvider>
			<ToastProvider>
				<LicenseProvider>
					<AppSettingsProvider>
						<AiSettingsProvider>
							<ProseThemeProvider>
								<App />
							</ProseThemeProvider>
						</AiSettingsProvider>
					</AppSettingsProvider>
				</LicenseProvider>
			</ToastProvider>
		</ThemeProvider>
	</React.StrictMode>
);
