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

const providers = [
	ThemeProvider,
	ToastProvider,
	LicenseProvider,
	AppSettingsProvider,
	AiSettingsProvider,
	ProseThemeProvider,
];

const Providers = providers.reduceRight(
	(children, Provider) => <Provider>{children}</Provider>,
	<App />
);

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
	<React.StrictMode>{Providers}</React.StrictMode>
);
