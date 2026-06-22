import { Component, type ErrorInfo, type ReactNode } from 'react';
import i18n from '@/i18n';

type ErrorBoundaryProps = {
	children: ReactNode;
};

type ErrorBoundaryState = {
	hasError: boolean;
	error: Error | null;
};

export class ErrorBoundary extends Component<
	ErrorBoundaryProps,
	ErrorBoundaryState
> {
	constructor(props: ErrorBoundaryProps) {
		super(props);
		this.state = { hasError: false, error: null };
	}

	static getDerivedStateFromError(error: Error): ErrorBoundaryState {
		return { hasError: true, error };
	}

	componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
		console.error('[ErrorBoundary] Uncaught error:', error);
		console.error('[ErrorBoundary] Component stack:', errorInfo.componentStack);
	}

	handleReset = () => {
		this.setState({ hasError: false, error: null });
	};

	render() {
		if (this.state.hasError) {
			return (
				<div className="flex h-screen flex-col items-center justify-center gap-4 bg-background p-8 text-foreground">
					<p className="text-lg font-medium">
						{i18n.t('errors.applicationError')}
					</p>
					<pre className="max-w-xl overflow-auto rounded-md bg-muted p-4 text-xs">
						{this.state.error?.message}
						{'\n'}
						{this.state.error?.stack}
					</pre>
					<button
						className="rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground"
						onClick={this.handleReset}
					>
						{i18n.t('errors.retry')}
					</button>
				</div>
			);
		}

		return this.props.children;
	}
}
