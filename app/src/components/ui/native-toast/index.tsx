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
import { Text, View } from 'react-native';
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

type NativeToastContextValue = {
	hideToast: () => void;
	showToast: (request: NativeToastRequest) => void;
	toast: NativeToastRequest | null;
};

const NativeToastContext = createContext<NativeToastContextValue | null>(null);
const DEFAULT_TOAST_DURATION_MS = 2400;

export function NativeToastProvider({ children }: { children: ReactNode }) {
	const [toast, setToast] = useState<NativeToastRequest | null>(null);
	const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

	const hideToast = useCallback(() => {
		if (timeoutRef.current) {
			clearTimeout(timeoutRef.current);
			timeoutRef.current = null;
		}
		setToast(null);
	}, []);

	const showToast = useCallback((request: NativeToastRequest) => {
		if (timeoutRef.current) {
			clearTimeout(timeoutRef.current);
		}

		setToast(request);
		timeoutRef.current = setTimeout(() => {
			setToast(null);
			timeoutRef.current = null;
		}, request.durationMs ?? DEFAULT_TOAST_DURATION_MS);
	}, []);

	useEffect(() => {
		return () => {
			if (timeoutRef.current) {
				clearTimeout(timeoutRef.current);
			}
		};
	}, []);

	const value = useMemo(
		() => ({
			hideToast,
			showToast,
			toast,
		}),
		[hideToast, showToast, toast]
	);

	return (
		<NativeToastContext.Provider value={value}>
			<View style={{ flex: 1 }}>
				{children}
				<NativeToastViewport />
			</View>
		</NativeToastContext.Provider>
	);
}

export function NativeToastViewport() {
	const value = useContext(NativeToastContext);
	const insets = useSafeAreaInsets();
	const palette = useAppThemePalette();
	const toast = value?.toast ?? null;

	if (!toast) {
		return null;
	}

	const toneColor =
		toast?.tone === 'error'
			? '#dc2626'
			: toast?.tone === 'success'
				? '#16a34a'
				: palette.accentSurface;

	return (
		<View
			pointerEvents="none"
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
			<View
				className="w-full max-w-[420px] flex-row rounded-xl border"
				pointerEvents="none"
				style={{
					backgroundColor: palette.surface,
					borderColor: palette.border,
					elevation: 32,
					overflow: 'hidden',
					shadowColor: '#000',
					shadowOffset: { height: 14, width: 0 },
					shadowOpacity: 0.36,
					shadowRadius: 26,
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
			</View>
		</View>
	);
}

export function useNativeToast() {
	const value = useContext(NativeToastContext);
	if (!value) {
		throw new Error('useNativeToast must be used within NativeToastProvider');
	}
	return value;
}
