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
	WORKSPACE_TAB_REQUEST_EVENT,
	WORKSPACE_TAB_STATE_EVENT,
	type MarkdownCompletionControl,
	type WorkspaceTab,
} from '@/features/editor';

type TabBarProps = Parameters<
	NonNullable<ComponentProps<typeof Tabs>['tabBar']>
>[0];
type TabIcon = ComponentType<{
	color?: string;
	size?: number;
	strokeWidth?: number;
}>;

const KEYBOARD_TOOLBAR_GAP = 6;
const FLOATING_TAB_BAR_GAP = 16;

export default function CustomTabBar({
	state,
	descriptors,
	navigation,
}: TabBarProps) {
	const { t } = useTranslation();
	const insets = useSafeAreaInsets();
	const toolbar = useMarkdownToolbar();
	const [keyboardHeight, setKeyboardHeight] = useState(0);
	const [workspaceTab, setWorkspaceTab] = useState<WorkspaceTab>('editor');
	const activeRoute = state.routes[state.index];
	const keyboardVisible = keyboardHeight > 0;
	const workspaceRouteFocused = activeRoute?.name === 'index';
	const showMarkdownToolbar =
		keyboardVisible && toolbar.visible && workspaceRouteFocused;
	const liftForKeyboard = keyboardVisible && workspaceRouteFocused;
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
				{showCompletion ? (
					<CompletionPill completion={toolbar.completion} />
				) : null}
				<View
					className="max-w-[92vw] rounded-full border border-white/10
						bg-neutral-950 p-1 shadow-lg shadow-black/25"
				>
					<ScrollView
						horizontal
						keyboardShouldPersistTaps="handled"
						showsHorizontalScrollIndicator={false}
						contentContainerStyle={{ alignItems: 'center', gap: 4 }}
					>
						{toolbar.actions.map((action) => (
							<MarkdownToolbarButton key={action.key} action={action} />
						))}
					</ScrollView>
				</View>
			</View>
		);
	}

	const workspaceRoute = state.routes.find((route) => route.name === 'index');
	const settingsRoute = state.routes.find((route) => route.name === 'settings');
	const workspaceFocused = workspaceRouteFocused && workspaceTab === 'editor';
	const fileTreeFocused = workspaceRouteFocused && workspaceTab === 'fileTree';
	const settingsFocused = activeRoute?.name === 'settings';

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
			className="absolute z-20"
			style={{ bottom, right }}
		>
			<FloatingCapsule>
				{workspaceRoute ? (
					<FloatingButton
						focused={workspaceFocused}
						icon={PenLine}
						label={
							descriptors[workspaceRoute.key].options.title ??
							workspaceRoute.name
						}
						onPress={() => selectWorkspaceTab('editor')}
					/>
				) : null}
				<FloatingButton
					focused={fileTreeFocused}
					icon={FolderTree}
					label={t('tabs.fileTree')}
					onPress={() => selectWorkspaceTab('fileTree')}
				/>
				{settingsRoute ? (
					<FloatingButton
						focused={settingsFocused}
						icon={Settings}
						label={
							descriptors[settingsRoute.key].options.title ?? settingsRoute.name
						}
						onPress={() => navigateToRoute('settings')}
					/>
				) : null}
			</FloatingCapsule>
		</View>
	);
}

function CompletionPill({
	completion,
}: {
	completion: MarkdownCompletionControl;
}) {
	if (completion.status === 'requesting') {
		return (
			<View
				accessibilityLabel={completion.accessibilityLabel}
				className="h-11 w-11 items-center justify-center rounded-full border
					border-white/10 bg-neutral-950 px-3 shadow-lg shadow-black/25"
			>
				<ActivityIndicator color="#ffffff" size="small" />
			</View>
		);
	}

	if (completion.status === 'ready') {
		return (
			<Pressable
				accessibilityLabel={completion.accessibilityLabel}
				onPress={completion.onAccept}
				className="h-11 w-11 items-center justify-center rounded-full border
					border-white/10 bg-neutral-950 shadow-lg shadow-black/25"
			>
				<Check color="#ffffff" size={15} strokeWidth={2.4} />
			</Pressable>
		);
	}

	return null;
}

function MarkdownToolbarButton({
	action,
}: {
	action: {
		icon: TabIcon;
		key: string;
		label: string;
		onPress: () => void;
	};
}) {
	const Icon = action.icon;

	return (
		<Pressable
			accessibilityLabel={action.label}
			onPress={action.onPress}
			className="min-h-9 min-w-9 items-center justify-center rounded-full px-2"
		>
			<Icon color="#ffffff" size={17} strokeWidth={2.2} />
		</Pressable>
	);
}

function FloatingCapsule({ children }: { children: ReactNode }) {
	return (
		<View
			className="flex-row items-center gap-0.5 rounded-full border
				border-white/10 bg-neutral-950 p-1 shadow-lg shadow-black/25"
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
}: {
	focused: boolean;
	icon: TabIcon;
	label: string;
	onPress: () => void;
}) {
	const color = focused ? '#ffffff' : 'rgba(255, 255, 255, 0.6)';

	return (
		<Pressable
			onPress={onPress}
			className={`flex-row items-center gap-1.5 rounded-full px-3 py-2
				${focused ? 'bg-white/15' : 'bg-transparent'}`}
		>
			<Icon color={color} size={15} strokeWidth={2.2} />
			<Text
				className={`text-[13px] ${focused ? 'text-white' : 'text-white/60'}`}
			>
				{label}
			</Text>
		</Pressable>
	);
}
