import {
	createContext,
	useCallback,
	useContext,
	useEffect,
	useMemo,
	useRef,
	useState,
	type ReactNode,
} from 'react';
import { Animated, PanResponder, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAppThemePalette } from '@/features/settings';

type NativeToastTone = 'error' | 'info' | 'success';

type NativeToastRequest = {
	description?: string;
	durationMs?: number;
	id?: string;
	title: string;
	tone?: NativeToastTone;
};

type NativeToastState = NativeToastRequest & {
	phase: 'hiding' | 'visible';
	stateId: number;
};

type NativeToastContextValue = {
	finishHideToast: () => void;
	hideToast: () => void;
	modalViewportCount: number;
	registerModalViewport: () => () => void;
	showToast: (request: NativeToastRequest) => void;
	toast: NativeToastState | null;
};

const NativeToastContext = createContext<NativeToastContextValue | null>(null);
const DEFAULT_TOAST_DURATION_MS = 2400;

export function NativeToastProvider({ children }: { children: ReactNode }) {
	const [modalViewportCount, setModalViewportCount] = useState(0);
	const [toast, setToast] = useState<NativeToastState | null>(null);
	const sequenceRef = useRef(0);
	const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

	const clearToastTimeout = useCallback(() => {
		if (timeoutRef.current) {
			clearTimeout(timeoutRef.current);
			timeoutRef.current = null;
		}
	}, []);

	const hideToast = useCallback(() => {
		clearToastTimeout();
		setToast((current) =>
			current && current.phase === 'visible'
				? { ...current, phase: 'hiding' }
				: current
		);
	}, [clearToastTimeout]);

	const finishHideToast = useCallback(() => {
		setToast(null);
	}, []);

	const registerModalViewport = useCallback(() => {
		setModalViewportCount((current) => current + 1);
		return () => {
			setModalViewportCount((current) => Math.max(0, current - 1));
		};
	}, []);

	const showToast = useCallback(
		(request: NativeToastRequest) => {
			clearToastTimeout();

			sequenceRef.current += 1;
			setToast({
				...request,
				phase: 'visible',
				stateId: sequenceRef.current,
			});
			timeoutRef.current = setTimeout(() => {
				hideToast();
			}, request.durationMs ?? DEFAULT_TOAST_DURATION_MS);
		},
		[clearToastTimeout, hideToast]
	);

	useEffect(() => {
		return () => {
			clearToastTimeout();
		};
	}, [clearToastTimeout]);

	const value = useMemo(
		() => ({
			finishHideToast,
			hideToast,
			modalViewportCount,
			registerModalViewport,
			showToast,
			toast,
		}),
		[
			finishHideToast,
			hideToast,
			modalViewportCount,
			registerModalViewport,
			showToast,
			toast,
		]
	);

	return (
		<NativeToastContext.Provider value={value}>
			<View style={{ flex: 1 }}>
				{children}
				<NativeToastViewport layer="root" />
			</View>
		</NativeToastContext.Provider>
	);
}

export function NativeToastViewport({
	layer = 'root',
}: {
	layer?: 'modal' | 'root';
}) {
	const value = useContext(NativeToastContext);
	const insets = useSafeAreaInsets();
	const toast = value?.toast ?? null;
	const registerModalViewport = value?.registerModalViewport;
	const shouldHideRoot =
		layer === 'root' && (value?.modalViewportCount ?? 0) > 0;

	useEffect(() => {
		if (layer !== 'modal') return undefined;
		return registerModalViewport?.();
	}, [layer, registerModalViewport]);

	if (!toast || shouldHideRoot) {
		return null;
	}

	return (
		<View
			pointerEvents="box-none"
			style={{
				alignItems: 'center',
				bottom: 0,
				elevation: 999,
				left: 0,
				paddingHorizontal: 16,
				paddingTop: Math.max(insets.top + 10, 18),
				position: 'absolute',
				right: 0,
				top: 0,
				zIndex: 999,
			}}
		>
			<NativeToastCard
				key={toast.stateId}
				onDismiss={value?.hideToast}
				onExited={value?.finishHideToast}
				toast={toast}
			/>
		</View>
	);
}

function NativeToastCard({
	onDismiss,
	onExited,
	toast,
}: {
	onDismiss?: () => void;
	onExited?: () => void;
	toast: NativeToastState;
}) {
	const palette = useAppThemePalette();
	const [opacity] = useState(() => new Animated.Value(0));
	const [translateY] = useState(() => new Animated.Value(-12));
	const [dragY] = useState(() => new Animated.Value(0));
	const toneColor =
		toast.tone === 'error'
			? '#dc2626'
			: toast.tone === 'success'
				? '#16a34a'
				: palette.accentSurface;

	const resetDrag = useCallback(() => {
		Animated.spring(dragY, {
			toValue: 0,
			useNativeDriver: true,
		}).start();
	}, [dragY]);

	const panResponder = useMemo(
		() =>
			PanResponder.create({
				onStartShouldSetPanResponder: () => true,
				onStartShouldSetPanResponderCapture: () => true,
				onMoveShouldSetPanResponderCapture: (_, gesture) =>
					gesture.dy < -6 && Math.abs(gesture.dy) > Math.abs(gesture.dx),
				onMoveShouldSetPanResponder: (_, gesture) =>
					gesture.dy < -6 && Math.abs(gesture.dy) > Math.abs(gesture.dx),
				onPanResponderGrant: () => {
					dragY.setValue(0);
				},
				onPanResponderMove: (_, gesture) => {
					dragY.setValue(Math.min(0, gesture.dy));
				},
				onPanResponderRelease: (_, gesture) => {
					if (gesture.dy < -36 || gesture.vy < -0.65) {
						onDismiss?.();
						return;
					}
					resetDrag();
				},
				onPanResponderTerminate: resetDrag,
				onShouldBlockNativeResponder: () => true,
			}),
		[dragY, onDismiss, resetDrag]
	);

	useEffect(() => {
		if (toast.phase === 'visible') {
			opacity.setValue(0);
			translateY.setValue(-12);
			dragY.setValue(0);
			Animated.parallel([
				Animated.timing(opacity, {
					duration: 180,
					toValue: 1,
					useNativeDriver: true,
				}),
				Animated.timing(translateY, {
					duration: 180,
					toValue: 0,
					useNativeDriver: true,
				}),
			]).start();
			return;
		}

		Animated.parallel([
			Animated.timing(opacity, {
				duration: 150,
				toValue: 0,
				useNativeDriver: true,
			}),
			Animated.timing(translateY, {
				duration: 150,
				toValue: -12,
				useNativeDriver: true,
			}),
		]).start(({ finished }) => {
			if (finished) onExited?.();
		});
	}, [dragY, onExited, opacity, toast.phase, translateY]);

	return (
		<Animated.View
			{...panResponder.panHandlers}
			collapsable={false}
			className="w-full max-w-[420px] flex-row rounded-xl border"
			pointerEvents="auto"
			style={{
				backgroundColor: palette.surface,
				borderColor: palette.border,
				elevation: 32,
				opacity,
				overflow: 'hidden',
				shadowColor: '#000',
				shadowOffset: { height: 14, width: 0 },
				shadowOpacity: 0.36,
				shadowRadius: 26,
				transform: [{ translateY: Animated.add(translateY, dragY) }],
			}}
		>
			<View
				style={{ alignSelf: 'stretch', backgroundColor: toneColor, width: 4 }}
			/>
			<View className="flex-1 px-4 py-3">
				<Text
					className="text-[14px] font-semibold"
					style={{ color: palette.foreground }}
				>
					{toast.title}
				</Text>
				{toast.description ? (
					<Text
						className="mt-1 text-[12px] leading-4"
						style={{ color: palette.mutedForeground }}
					>
						{toast.description}
					</Text>
				) : null}
			</View>
		</Animated.View>
	);
}

export function useNativeToast() {
	const value = useContext(NativeToastContext);
	if (!value) {
		throw new Error('useNativeToast must be used within NativeToastProvider');
	}
	return value;
}
