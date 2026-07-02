import { SyncSettingsScreen } from '@/features/madora-sync';
import { SettingsBackButton } from '@/features/settings';

export default function SyncSettingsRoute() {
	return (
		<>
			<SettingsBackButton />
			<SyncSettingsScreen />
		</>
	);
}
