import React from 'react';
import ReactDOM from 'react-dom/client';
import '@/i18n';
import App from './App';
import { ErrorBoundary } from '@/components/system/error-boundary';
import { AiSettingsProvider } from '@/context/ai-settings-provider';
import { AppSettingsProvider } from '@/context/app-settings-provider';
import { LicenseProvider } from '@/context/license-provider';
import { ProseThemeProvider } from '@/context/prose-theme-provider';
import { ThemeProvider } from '@/context/theme-provider';
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
	<React.StrictMode>
		<ErrorBoundary>{Providers}</ErrorBoundary>
	</React.StrictMode>
);
