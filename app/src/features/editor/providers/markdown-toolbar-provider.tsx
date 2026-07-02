import {
	createContext,
	useCallback,
	useContext,
	useMemo,
	useState,
	type ComponentType,
	type ReactNode,
} from 'react';

export type MarkdownToolbarIcon = ComponentType<{
	color?: string;
	size?: number;
	strokeWidth?: number;
}>;

export type MarkdownToolbarAction = {
	icon: MarkdownToolbarIcon;
	key: string;
	label: string;
	onPress: () => void;
};

export type MarkdownCompletionControl = {
	accessibilityLabel?: string;
	label?: string;
	onAccept?: () => void;
	status: 'idle' | 'requesting' | 'ready';
};

type MarkdownToolbarState = {
	actions: MarkdownToolbarAction[];
	completion: MarkdownCompletionControl;
	visible: boolean;
};

type MarkdownToolbarContextValue = {
	toolbar: MarkdownToolbarState;
	setToolbar: (toolbar: MarkdownToolbarState | null) => void;
};

const EMPTY_TOOLBAR: MarkdownToolbarState = {
	actions: [],
	completion: { status: 'idle' },
	visible: false,
};

const MarkdownToolbarContext =
	createContext<MarkdownToolbarContextValue | null>(null);

export function MarkdownToolbarProvider({ children }: { children: ReactNode }) {
	const [toolbar, setToolbarState] =
		useState<MarkdownToolbarState>(EMPTY_TOOLBAR);

	const setToolbar = useCallback((nextToolbar: MarkdownToolbarState | null) => {
		setToolbarState(nextToolbar ?? EMPTY_TOOLBAR);
	}, []);

	const value = useMemo(
		() => ({
			toolbar,
			setToolbar,
		}),
		[setToolbar, toolbar]
	);

	return (
		<MarkdownToolbarContext.Provider value={value}>
			{children}
		</MarkdownToolbarContext.Provider>
	);
}

export function useMarkdownToolbar() {
	const value = useContext(MarkdownToolbarContext);
	if (!value) {
		throw new Error(
			'useMarkdownToolbar must be used within MarkdownToolbarProvider'
		);
	}
	return value.toolbar;
}

export function useSetMarkdownToolbar() {
	const value = useContext(MarkdownToolbarContext);
	if (!value) {
		throw new Error(
			'useSetMarkdownToolbar must be used within MarkdownToolbarProvider'
		);
	}
	return value.setToolbar;
}
