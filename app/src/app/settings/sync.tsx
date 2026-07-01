import { SettingsBackButton } from '../../features/settings/settings-screen';
import { SyncSettingsScreen } from '../../features/madora-sync/sync-settings-screen';

export default function SyncSettingsRoute() {
	return (
		<>
			<SettingsBackButton />
			<SyncSettingsScreen />
		</>
	);
}
