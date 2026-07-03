import { router } from 'expo-router';

import { SyncSettingsScreen } from '@/features/madora-sync';

export default function SyncSettingsRoute() {
	return <SyncSettingsScreen onBack={() => router.back()} />;
}
