import { invoke } from '@tauri-apps/api/core';

export type LicenseState = 'trial' | 'active' | 'expired' | 'revoked';

export type LicenseStatus = {
	state: LicenseState;
	trialDaysRemaining: number | null;
	trialDaysTotal: number;
	activated: boolean;
	licenseKey: string | null;
	email: string | null;
	activationIndex: number | null;
	revokedAt: string | null;
};

/** Verifies the current license with the server. */
export async function verifyLicense(): Promise<LicenseStatus> {
	return invoke<LicenseStatus>('verify_license');
}

/** Returns the locally-cached license status. */
export async function getLicenseStatus(): Promise<LicenseStatus> {
	return invoke<LicenseStatus>('get_license_status');
}

/** Activates a license key. */
export async function activateLicense(opts: {
	key: string;
}): Promise<LicenseStatus> {
	return invoke<LicenseStatus>('activate_license', { key: opts.key });
}

/** Deactivates the current license. */
export async function deactivateLicense(): Promise<void> {
	return invoke('deactivate_license');
}
