import { router } from 'expo-router';

import { AiSettingsScreen } from '@/features/ai';

export default function AiSettingsRoute() {
	return <AiSettingsScreen onBack={() => router.back()} />;
}
