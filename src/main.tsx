import React from 'react';
import ReactDOM from 'react-dom/client';
import '@/i18n';
import App from './App';
import { ErrorBoundary } from '@/components/system/error-boundary';
import { AiSettingsProvider } from '@/context/ai-settings-provider';
import { AppSettingsProvider } from '@/context/app-settings-provider';
import { ProseThemeProvider } from '@/context/prose-theme-provider';
import { ThemeProvider } from '@/context/theme-provider';
import { getLaunchMode } from '@/invoke/system';
import { setLaunchMode } from '@/lib/launch-mode';
import { ToastProvider } from './components/ui/toast';
import './index.css';

const providers = [
	ThemeProvider,
	ToastProvider,
	AppSettingsProvider,
	AiSettingsProvider,
	ProseThemeProvider,
];

const Providers = providers.reduceRight(
	(children, Provider) => <Provider>{children}</Provider>,
	<App />
);

async function bootstrap() {
	// Everything below reads the launch mode synchronously, so it is known
	// before the first render. The window stays hidden until the app shows it.
	setLaunchMode(await getLaunchMode().catch(() => 'full'));

	ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
		<React.StrictMode>
			<ErrorBoundary>{Providers}</ErrorBoundary>
		</React.StrictMode>
	);
}

void bootstrap();
