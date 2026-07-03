import { useEffect, useState } from 'react';
import {
	ActivityIndicator,
	DeviceEventEmitter,
	Keyboard,
	Pressable,
	ScrollView,
	Text,
	View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { ComponentProps, ComponentType, ReactNode } from 'react';
import type { Tabs } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Check, FolderTree, PenLine, Settings } from 'lucide-react-native';
import {
	useMarkdownToolbar,
	WORKSPACE_EDITOR_INPUT_ACTIVE_EVENT,
	WORKSPACE_EDITOR_OVERLAY_ACTIVE_EVENT,
	WORKSPACE_TAB_REQUEST_EVENT,
	WORKSPACE_TAB_STATE_EVENT,
	type MarkdownCompletionControl,
	type WorkspaceTab,
} from '@/features/editor';
import {
	useResolvedThemePreference,
	type ResolvedThemePreference,
} from '@/features/settings';

type TabBarProps = Parameters<
	NonNullable<ComponentProps<typeof Tabs>['tabBar']>
>[0];
type TabIcon = ComponentType<{
	color?: string;
	size?: number;
	strokeWidth?: number;
}>;
type FloatingSurfacePalette = {
	activeBackground: string;
	borderColor: string;
	iconColor: string;
	mutedIconColor: string;
	surfaceColor: string;
	textColor: string;
	mutedTextColor: string;
};

const KEYBOARD_TOOLBAR_GAP = 6;
const FLOATING_TAB_BAR_GAP = 16;
const FLOATING_STATUS_SLOT_SIZE = 40;

export default function CustomTabBar({
	state,
	descriptors,
	navigation,
}: TabBarProps) {
	const { t } = useTranslation();
	const insets = useSafeAreaInsets();
	const toolbar = useMarkdownToolbar();
	const resolvedTheme = useResolvedThemePreference();
	const [editorInputActive, setEditorInputActive] = useState(true);
	const [editorOverlayActive, setEditorOverlayActive] = useState(false);
	const [keyboardHeight, setKeyboardHeight] = useState(0);
	const [workspaceTab, setWorkspaceTab] = useState<WorkspaceTab>('editor');
	const palette = getFloatingSurfacePalette(resolvedTheme);
	const activeRoute = state.routes[state.index];
	const keyboardVisible = keyboardHeight > 0;
	const workspaceRouteFocused = activeRoute?.name === 'index';
	const workspaceFocused = workspaceRouteFocused && workspaceTab === 'editor';
	const fileTreeFocused = workspaceRouteFocused && workspaceTab === 'fileTree';
	const settingsFocused = activeRoute?.name === 'settings';
	const workspaceModeAction = workspaceFocused
		? (toolbar.actions.find(
				(action) => action.key === 'preview' || action.key === 'edit'
			) ?? null)
		: null;
	const keyboardToolbarActions = toolbar.actions.filter(
		(action) => action.key !== 'preview' && action.key !== 'edit'
	);
	const showMarkdownToolbar =
		keyboardVisible &&
		workspaceTab === 'editor' &&
		editorInputActive &&
		!editorOverlayActive &&
		toolbar.visible &&
		workspaceRouteFocused;
	const liftForKeyboard = showMarkdownToolbar;
	const bottom = liftForKeyboard
		? keyboardHeight + insets.bottom + KEYBOARD_TOOLBAR_GAP
		: FLOATING_TAB_BAR_GAP + insets.bottom;
	const right = 12 + insets.right;

	useEffect(() => {
		const showSubscription = Keyboard.addListener(
			'keyboardDidShow',
			(event) => {
				setKeyboardHeight(event.endCoordinates.height);
			}
		);
		const hideSubscription = Keyboard.addListener('keyboardDidHide', () => {
			setKeyboardHeight(0);
		});

		return () => {
			showSubscription.remove();
			hideSubscription.remove();
		};
	}, []);

	useEffect(() => {
		const subscription = DeviceEventEmitter.addListener(
			WORKSPACE_TAB_STATE_EVENT,
			(tab) => {
				if (tab === 'editor' || tab === 'fileTree') {
					setWorkspaceTab(tab);
				}
			}
		);

		return () => subscription.remove();
	}, []);

	useEffect(() => {
		const subscription = DeviceEventEmitter.addListener(
			WORKSPACE_EDITOR_INPUT_ACTIVE_EVENT,
			(active) => {
				setEditorInputActive(Boolean(active));
			}
		);

		return () => subscription.remove();
	}, []);

	useEffect(() => {
		const subscription = DeviceEventEmitter.addListener(
			WORKSPACE_EDITOR_OVERLAY_ACTIVE_EVENT,
			(active) => {
				setEditorOverlayActive(Boolean(active));
			}
		);

		return () => subscription.remove();
	}, []);

	if (showMarkdownToolbar) {
		const showCompletion =
			toolbar.completion.status === 'requesting' ||
			toolbar.completion.status === 'ready';

		return (
			<View
				pointerEvents="box-none"
				className="absolute z-20 flex-row items-center gap-2"
				style={{ bottom, right }}
			>
				<View
					pointerEvents={showCompletion ? 'auto' : 'none'}
					className="items-start justify-center"
					style={{ width: FLOATING_STATUS_SLOT_SIZE }}
				>
					{showCompletion ? (
						<CompletionPill completion={toolbar.completion} palette={palette} />
					) : null}
				</View>
				<View
					className="max-w-[92vw] rounded-full p-1 shadow-lg shadow-black/25"
					style={{
						backgroundColor: palette.surfaceColor,
						borderColor: palette.borderColor,
						borderWidth: 1,
					}}
				>
					<ScrollView
						horizontal
						keyboardShouldPersistTaps="handled"
						showsHorizontalScrollIndicator={false}
						contentContainerStyle={{ alignItems: 'center', gap: 4 }}
					>
						{keyboardToolbarActions.map((action) => (
							<MarkdownToolbarButton
								key={action.key}
								action={action}
								palette={palette}
							/>
						))}
					</ScrollView>
				</View>
			</View>
		);
	}

	const workspaceRoute = state.routes.find((route) => route.name === 'index');
	const settingsRoute = state.routes.find((route) => route.name === 'settings');

	const navigateToRoute = (routeName: string) => {
		const route = state.routes.find((item) => item.name === routeName);
		if (!route) return;

		const event = navigation.emit({
			type: 'tabPress',
			target: route.key,
			canPreventDefault: true,
		});

		if (!event.defaultPrevented && activeRoute?.name !== routeName) {
			navigation.navigate(route.name);
		}
	};

	const selectWorkspaceTab = (tab: WorkspaceTab) => {
		setWorkspaceTab(tab);
		if (activeRoute?.name !== 'index') {
			navigateToRoute('index');
			setTimeout(
				() => DeviceEventEmitter.emit(WORKSPACE_TAB_REQUEST_EVENT, tab),
				80
			);
			return;
		}
		DeviceEventEmitter.emit(WORKSPACE_TAB_REQUEST_EVENT, tab);
	};

	return (
		<View
			pointerEvents="box-none"
			className="absolute z-20 flex-row items-center gap-2"
			style={{ bottom, right }}
		>
			{workspaceModeAction ? (
				<FloatingModeButton action={workspaceModeAction} palette={palette} />
			) : null}
			<FloatingCapsule palette={palette}>
				{workspaceRoute ? (
					<FloatingButton
						focused={workspaceFocused}
						icon={PenLine}
						label={
							descriptors[workspaceRoute.key].options.title ??
							workspaceRoute.name
						}
						onPress={() => selectWorkspaceTab('editor')}
						palette={palette}
					/>
				) : null}
				<FloatingButton
					focused={fileTreeFocused}
					icon={FolderTree}
					label={t('tabs.fileTree')}
					onPress={() => selectWorkspaceTab('fileTree')}
					palette={palette}
				/>
				{settingsRoute ? (
					<FloatingButton
						focused={settingsFocused}
						icon={Settings}
						label={
							descriptors[settingsRoute.key].options.title ?? settingsRoute.name
						}
						onPress={() => navigateToRoute('settings')}
						palette={palette}
					/>
				) : null}
			</FloatingCapsule>
		</View>
	);
}

function CompletionPill({
	completion,
	palette,
}: {
	completion: MarkdownCompletionControl;
	palette: FloatingSurfacePalette;
}) {
	if (completion.status === 'requesting') {
		return (
			<FloatingCapsule palette={palette}>
				<View
					accessibilityLabel={completion.accessibilityLabel}
					className="h-8 w-8 items-center justify-center rounded-full"
				>
					<ActivityIndicator color={palette.iconColor} size="small" />
				</View>
			</FloatingCapsule>
		);
	}

	if (completion.status === 'ready') {
		return (
			<FloatingCapsule palette={palette}>
				<Pressable
					accessibilityLabel={completion.accessibilityLabel}
					onPress={completion.onAccept}
					className="h-8 w-8 items-center justify-center rounded-full"
				>
					<Check color={palette.iconColor} size={15} strokeWidth={2.4} />
				</Pressable>
			</FloatingCapsule>
		);
	}

	return null;
}

function MarkdownToolbarButton({
	action,
	palette,
}: {
	action: {
		icon: TabIcon;
		key: string;
		label: string;
		onPress: () => void;
	};
	palette: FloatingSurfacePalette;
}) {
	const Icon = action.icon;

	return (
		<Pressable
			accessibilityLabel={action.label}
			onPress={action.onPress}
			className="min-h-9 min-w-9 items-center justify-center rounded-full px-2"
		>
			<Icon color={palette.iconColor} size={17} strokeWidth={2.2} />
		</Pressable>
	);
}

function FloatingCapsule({
	children,
	palette,
}: {
	children: ReactNode;
	palette: FloatingSurfacePalette;
}) {
	return (
		<View
			className="flex-row items-center gap-0.5 rounded-full p-1 shadow-lg
				shadow-black/25"
			style={{
				backgroundColor: palette.surfaceColor,
				borderColor: palette.borderColor,
				borderWidth: 1,
			}}
		>
			{children}
		</View>
	);
}

function FloatingButton({
	focused,
	icon: Icon,
	label,
	onPress,
	palette,
}: {
	focused: boolean;
	icon: TabIcon;
	label: string;
	onPress: () => void;
	palette: FloatingSurfacePalette;
}) {
	const color = focused ? palette.textColor : palette.mutedIconColor;

	return (
		<Pressable
			onPress={onPress}
			className="flex-row items-center gap-1.5 rounded-full px-3 py-2"
			style={{
				backgroundColor: focused ? palette.activeBackground : 'transparent',
			}}
		>
			<Icon color={color} size={15} strokeWidth={2.2} />
			<Text
				className="text-[13px]"
				style={{ color: focused ? palette.textColor : palette.mutedTextColor }}
			>
				{label}
			</Text>
		</Pressable>
	);
}

function FloatingModeButton({
	action,
	palette,
}: {
	action: {
		icon: TabIcon;
		key: string;
		label: string;
		onPress: () => void;
	};
	palette: FloatingSurfacePalette;
}) {
	const Icon = action.icon;

	return (
		<FloatingCapsule palette={palette}>
			<Pressable
				accessibilityLabel={action.label}
				onPress={action.onPress}
				className="h-8 w-8 items-center justify-center rounded-full"
			>
				<Icon color={palette.textColor} size={15} strokeWidth={2.2} />
			</Pressable>
		</FloatingCapsule>
	);
}

function getFloatingSurfacePalette(
	theme: ResolvedThemePreference
): FloatingSurfacePalette {
	if (theme === 'dark') {
		return {
			activeBackground: 'rgba(255, 255, 255, 0.08)',
			borderColor: 'rgba(255, 255, 255, 0.08)',
			iconColor: '#f5f5f5',
			mutedIconColor: 'rgba(245, 245, 245, 0.65)',
			mutedTextColor: 'rgba(245, 245, 245, 0.65)',
			surfaceColor: '#1a1a1a',
			textColor: '#f5f5f5',
		};
	}

	return {
		activeBackground: 'rgba(17, 24, 39, 0.06)',
		borderColor: 'rgba(17, 24, 39, 0.08)',
		iconColor: '#111827',
		mutedIconColor: 'rgba(17, 24, 39, 0.58)',
		mutedTextColor: 'rgba(17, 24, 39, 0.58)',
		surfaceColor: '#ffffff',
		textColor: '#111827',
	};
}
