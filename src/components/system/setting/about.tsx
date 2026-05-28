import {
	getIdentifier,
	getName,
	getTauriVersion,
	getVersion,
} from '@tauri-apps/api/app';
import { useEffect, useState } from 'react';
import logo from '@/assets/icon.png';
import packageJson from '../../../../package.json';
import { Stat } from '@/components/system/setting/shared';
import { ExternalLinkAnchor } from '@/components/ui/external-link';

type AppInfo = {
	identifier: string;
	name: string;
	tauriVersion: string;
	version: string;
};

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
		const [name, version, tauriVersion, identifier] = await Promise.all([
			getName(),
			getVersion(),
			getTauriVersion(),
			getIdentifier(),
		]);
		return { identifier, name, tauriVersion, version };
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
		{ label: 'Version', value: appInfo.version },
		{ label: 'By', value: 'ichiyo' },
		{
			label: 'Website',
			value: (
				<ExternalLinkAnchor href={WEBSITE_URL}>
					{WEBSITE_URL}
				</ExternalLinkAnchor>
			),
		},
		{
			label: 'Source Code',
			value: (
				<ExternalLinkAnchor href={SOURCE_CODE_URL}>
					{SOURCE_CODE_URL}
				</ExternalLinkAnchor>
			),
		},
	];

	return (
		<div className="space-y-4">
			<section
				className="overflow-hidden rounded-2xl border bg-linear-to-br
					from-primary/12 via-background to-background shadow-xs"
			>
				<div className="flex flex-col gap-6 p-5 sm:p-6">
					<div className="flex flex-col items-start gap-4 sm:gap-6">
						<div className="flex items-center gap-3">
							<img
								alt="Madora"
								className="size-12 shrink-0 rounded-2xl"
								src={logo}
							/>
							<h1
								className="text-3xl font-medium tracking-tight
									text-muted-foreground"
							>
								Madora
							</h1>
						</div>
						<p className="font-mono text-4xl font-medium tracking-tight">
							Markdown editing,
							<br />
							<span className="text-muted-foreground">powered by AI</span>
						</p>
					</div>
					<div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
						{stats.map(({ label, value }) => (
							<Stat key={label} label={label} value={value} />
						))}
					</div>
				</div>
			</section>
		</div>
	);
}
