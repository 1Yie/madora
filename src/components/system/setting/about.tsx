import { getAppInfo } from '@/invoke/app';
import type { AppInfo } from '@/invoke/app';
import { useEffect, useState } from 'react';
import logo from '@/assets/icon.png';
import packageJson from '../../../../package.json';
import {
	BrandShard,
	SettingsSectionCard,
	Stat,
} from '@/components/system/setting/shared';
import { ExternalLinkAnchor } from '@/components/ui/external-link';
import licenses from '@/assets/licenses.json';

const FALLBACK_APP_INFO: AppInfo = {
	identifier: 'in.ichiyo.madora',
	name: 'Madora',
	tauriVersion: '-',
	version: packageJson.version,
};

const WEBSITE_URL = 'https://madora.ichiyo.in';
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
	const appInfo = useAppInfo();

	const stats: Array<{ label: string; value: React.ReactNode }> = [
		{ label: '版本', value: appInfo.version },
		{ label: '作者', value: 'ichiyo' },
		{
			label: '网站',
			value: (
				<ExternalLinkAnchor href={WEBSITE_URL}>
					{WEBSITE_URL}
				</ExternalLinkAnchor>
			),
		},
		{
			label: '源代码',
			value: (
				<ExternalLinkAnchor href={SOURCE_CODE_URL}>
					{SOURCE_CODE_URL}
				</ExternalLinkAnchor>
			),
		},
	];
	return (
		<div className="space-y-4">
			<BrandShard
				logoSrc={logo}
				appName="Madora"
				tagline={
					<p className="font-mono text-4xl font-medium tracking-tight">
						Markdown editing,
						<br />
						<span className="text-muted-foreground">powered by AI</span>
					</p>
				}
			>
				<div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
					{stats.map(({ label, value }) => (
						<Stat key={label} label={label} value={value} />
					))}
				</div>
			</BrandShard>
			<SettingsSectionCard title="开源许可">
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
