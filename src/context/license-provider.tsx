import create from 'zustand';
import { useEffect, useRef, type ReactNode } from 'react';
import { showErrorToast } from '@/components/ui/toast';
import {
	activateLicense,
	deactivateLicense,
	getLicenseStatus,
	verifyLicense,
	type LicenseState,
	type LicenseStatus,
} from '@/invoke/license';

type LicenseState_ = {
	status: LicenseStatus | null;
	isLoading: boolean;
};

type LicenseActions = {
	activate: (key: string) => Promise<void>;
	deactivate: () => Promise<void>;
	refresh: () => Promise<void>;
};

type LicenseStore = LicenseState_ & LicenseActions;

const useLicenseStore = create<LicenseStore>((set) => ({
	status: null,
	isLoading: true,

	activate: async (key) => {
		set({ isLoading: true });
		try {
			const result = await activateLicense({ key });
			prevLicenseStateRef.current = result.state;
			set({ status: result, isLoading: false });
		} catch (error) {
			set({ isLoading: false });
			showErrorToast('激活失败', String(error));
			throw error;
		}
	},

	deactivate: async () => {
		set({ isLoading: true });
		try {
			await deactivateLicense();
			const { refresh } = useLicenseStore.getState();
			await refresh();
		} catch (error) {
			set({ isLoading: false });
			showErrorToast('停用失败', String(error));
			throw error;
		}
	},

	refresh: async () => {
		try {
			const result = await verifyLicense();
			const prev = prevLicenseStateRef.current;
			prevLicenseStateRef.current = result.state;

			// Detect transition to revoked mid-session and show toast
			if (result.state === 'revoked' && prev && prev !== 'revoked') {
				showErrorToast('许可证被吊销', '您的许可证已被吊销，AI 补全功能已禁用');
			}

			set({ status: result, isLoading: false });
		} catch (error) {
			console.error('Failed to verify license:', error);
			// Fall back to local status if server is unreachable
			try {
				const fallback = await getLicenseStatus();
				set({ status: fallback, isLoading: false });
			} catch {
				set({ isLoading: false });
			}
		}
	},
}));

// Track previous license state across refreshes for revoked detection.
// Module-level ref because the store is a singleton.
const prevLicenseStateRef: { current: LicenseState | null } = { current: null };

export { useLicenseStore };

export function LicenseProvider({ children }: { children: ReactNode }) {
	const hasRefreshed = useRef(false);

	// Verify once on app startup
	useEffect(() => {
		if (hasRefreshed.current) return;
		hasRefreshed.current = true;
		const { refresh } = useLicenseStore.getState();
		void refresh();
	}, []);

	return <>{children}</>;
}

export function useLicense(): LicenseStore {
	return useLicenseStore();
}
