import {
	createContext,
	useCallback,
	useContext,
	useEffect,
	useRef,
	useState,
	type ReactNode,
} from 'react';
import { invoke } from '@tauri-apps/api/core';
import { showErrorToast } from '@/components/ui/toast';

export type LicenseState = 'trial' | 'active' | 'expired' | 'revoked';

export interface LicenseStatus {
	state: LicenseState;
	trialDaysRemaining: number | null;
	trialDaysTotal: number;
	activated: boolean;
	licenseKey: string | null;
	email: string | null;
	activationIndex: number | null;
	revokedAt: string | null;
}

interface LicenseContextValue {
	status: LicenseStatus | null;
	isLoading: boolean;
	activate: (key: string) => Promise<void>;
	deactivate: () => Promise<void>;
	refresh: () => Promise<void>;
}

const LicenseContext = createContext<LicenseContextValue | null>(null);

export function LicenseProvider({ children }: { children: ReactNode }) {
	const [status, setStatus] = useState<LicenseStatus | null>(null);
	const [isLoading, setIsLoading] = useState(true);
	const prevStateRef = useRef<LicenseState | null>(null);

	const refresh = useCallback(async () => {
		try {
			const result = await invoke<LicenseStatus>('verify_license');
			const prev = prevStateRef.current;
			prevStateRef.current = result.state;

			// Detect transition to revoked mid-session and show toast
			if (result.state === 'revoked' && prev && prev !== 'revoked') {
				showErrorToast('许可证被吊销', '您的许可证已被吊销，AI 补全功能已禁用');
			}

			setStatus(result);
		} catch (error) {
			console.error('Failed to verify license:', error);
			// Fall back to local status if server is unreachable
			try {
				const fallback = await invoke<LicenseStatus>('get_license_status');
				setStatus(fallback);
			} catch {
				// Silently fail — app will show loading state
			}
		} finally {
			setIsLoading(false);
		}
	}, []);

	// Verify once on app startup
	useEffect(() => {
		// eslint-disable-next-line react-hooks/set-state-in-effect
		void refresh();
	}, [refresh]);

	const activate = useCallback(async (key: string) => {
		setIsLoading(true);
		try {
			const result = await invoke<LicenseStatus>('activate_license', {
				key,
			});
			prevStateRef.current = result.state;
			setStatus(result);
		} catch (error) {
			showErrorToast('激活失败', String(error));
			throw error;
		} finally {
			setIsLoading(false);
		}
	}, []);

	const deactivate = useCallback(async () => {
		setIsLoading(true);
		try {
			await invoke('deactivate_license');
			await refresh();
		} catch (error) {
			showErrorToast('停用失败', String(error));
			throw error;
		} finally {
			setIsLoading(false);
		}
	}, [refresh]);

	return (
		<LicenseContext.Provider
			value={{ status, isLoading, activate, deactivate, refresh }}
		>
			{children}
		</LicenseContext.Provider>
	);
}

export function useLicense(): LicenseContextValue {
	const context = useContext(LicenseContext);
	if (!context) {
		throw new Error('useLicense must be used within a LicenseProvider');
	}
	return context;
}
