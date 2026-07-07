import { useCallback } from 'react';
import { BackHandler } from 'react-native';
import { router, useFocusEffect } from 'expo-router';

import { SyncSettingsScreen } from '@/features/madora-sync';

export default function SyncSettingsRoute() {
	const goBackToSettings = useCallback(() => {
		router.dismissTo('/settings');
	}, []);

	useFocusEffect(
		useCallback(() => {
			const subscription = BackHandler.addEventListener(
				'hardwareBackPress',
				() => {
					goBackToSettings();
					return true;
				}
			);

			return () => subscription.remove();
		}, [goBackToSettings])
	);

	return <SyncSettingsScreen onBack={goBackToSettings} />;
}
