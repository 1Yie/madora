import { router } from 'expo-router';

import { AiSettingsScreen } from '../../features/ai/ai-settings-screen';

export default function AiSettingsRoute() {
	return <AiSettingsScreen onBack={() => router.back()} />;
}
