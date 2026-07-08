import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import logo from '@/assets/icon.png';
import licenses from '@/assets/licenses.json';
import {
	BrandShard,
	SettingRow,
	SettingsSectionCard,
	Stat,
} from '@/components/system/setting/shared';
import { Button } from '@/components/ui/button';
import { ExternalLinkAnchor } from '@/components/ui/external-link';
import { getAppInfo } from '@/invoke/app';
import type { AppInfo } from '@/invoke/app';
import { checkForAppUpdate } from '@/lib/update-check';
import {
	showUpdateAvailableToast,
	showUpdateCheckErrorToast,
	showUpToDateToast,
} from '@/lib/update-toast';
import packageJson from '../../../../package.json';

const FALLBACK_APP_INFO: AppInfo = {
	identifier: 'im.ingstar.madora',
	name: 'Madora',
	tauriVersion: '-',
	version: packageJson.version,
};

const WEBSITE_URL = 'https://madora.ingstar.im';
const SOURCE_CODE_URL = 'https://github.com/1Yie/madora';

async function readAppInfo(): Promise<AppInfo> {
	try {
		return await getAppInfo();
	} catch {
		return FALLBACK_APP_INFO;
	}
}

function useAppInfo() {
	const [appInfo, setAppInfo] = useState<AppInfo>(FALLBACK_APP_INFO);

	useEffect(() => {
		let active = true;
		void readAppInfo().then((info) => {
			if (active) setAppInfo(info);
		});
		return () => {
			active = false;
		};
	}, []);

	return appInfo;
}

export function AboutSettings() {
	const { t } = useTranslation();
	const appInfo = useAppInfo();
	const [checkingForUpdate, setCheckingForUpdate] = useState(false);

	const stats: Array<{ label: string; value: React.ReactNode }> = [
		{ label: t('settings.about.stats.version'), value: appInfo.version },
		{ label: t('settings.about.stats.author'), value: 'ichiyo' },
		{
			label: t('settings.about.stats.website'),
			value: (
				<ExternalLinkAnchor href={WEBSITE_URL}>
					{WEBSITE_URL}
				</ExternalLinkAnchor>
			),
		},
		{
			label: t('settings.about.stats.sourceCode'),
			value: (
				<ExternalLinkAnchor href={SOURCE_CODE_URL}>
					{SOURCE_CODE_URL}
				</ExternalLinkAnchor>
			),
		},
	];

	const handleCheckForUpdate = async () => {
		if (checkingForUpdate) {
			return;
		}

		setCheckingForUpdate(true);
		try {
			const updateInfo = await checkForAppUpdate(appInfo.version);
			if (updateInfo.updateAvailable) {
				showUpdateAvailableToast(updateInfo, t);
			} else {
				showUpToDateToast(updateInfo.currentVersion, t);
			}
		} catch (error) {
			showUpdateCheckErrorToast(error, t);
		} finally {
			setCheckingForUpdate(false);
		}
	};

	return (
		<div className="space-y-4">
			<BrandShard
				logoSrc={logo}
				appName="Madora"
				tagline={
					<p className="font-mono text-4xl font-medium tracking-tight">
						{t('setup.welcome.taglineTop')}
						<br />
						<span className="text-muted-foreground">
							{t('setup.welcome.taglineBottom')}
						</span>
					</p>
				}
			>
				<div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
					{stats.map(({ label, value }) => (
						<Stat key={label} label={label} value={value} />
					))}
				</div>
			</BrandShard>
			<SettingsSectionCard title={t('settings.about.cards.update.title')}>
				<SettingRow
					title={t('settings.about.actions.check')}
					description={t('settings.about.currentVersionDescription', {
						version: appInfo.version,
					})}
				>
					<Button
						loading={checkingForUpdate}
						variant="outline"
						onClick={() => {
							void handleCheckForUpdate();
						}}
					>
						{t('settings.about.actions.check')}
					</Button>
				</SettingRow>
			</SettingsSectionCard>
			<SettingsSectionCard title={t('settings.about.cards.licenses.title')}>
				<div className="-mx-5 -mb-5 overflow-hidden">
					<div className="divide-y divide-border">
						{licenses.map((entry) => (
							<div
								key={entry.name}
								className="flex items-center justify-between gap-4 px-5 py-3
									text-sm"
							>
								<ExternalLinkAnchor href={entry.url}>
									{entry.name}
								</ExternalLinkAnchor>
								<span className="shrink-0 tabular-nums text-muted-foreground">
									{entry.license}
								</span>
							</div>
						))}
					</div>
				</div>
			</SettingsSectionCard>
		</div>
	);
}
