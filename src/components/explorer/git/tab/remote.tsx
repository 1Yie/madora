import { useTranslation } from 'react-i18next';
import { useState } from 'react';

import { Download, Upload, Settings as Settings2 } from '@keyline-icons/react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
	FieldBlock,
	SettingsPanel,
	SettingsSectionCard,
} from '@/components/system/setting/shared';

type GitTabRemoteProps = {
	actionBusy: boolean;
	canOperate: boolean;
	initialRemoteName: string;
	initialRemoteUrl: string;
	onPull: () => void;
	onPush: () => void;
	onSave: (remoteName: string, remoteUrl: string) => void | Promise<void>;
};

export function GitTabRemote({
	actionBusy,
	canOperate,
	initialRemoteName,
	initialRemoteUrl,
	onPull,
	onPush,
	onSave,
}: GitTabRemoteProps) {
	const { t } = useTranslation();
	const [remoteName, setRemoteName] = useState(initialRemoteName);
	const [remoteUrl, setRemoteUrl] = useState(initialRemoteUrl);

	return (
		<div className="space-y-8">
			<SettingsSectionCard>
				<SettingsPanel>
					<FieldBlock label={t('git.remoteName')}>
						<Input
							nativeInput
							onChange={(event) => setRemoteName(event.target.value)}
							placeholder="origin"
							value={remoteName}
						/>
					</FieldBlock>
					<FieldBlock label={t('git.remoteUrl')}>
						<Input
							nativeInput
							onChange={(event) => setRemoteUrl(event.target.value)}
							placeholder="git@github.com:user/repo.git"
							value={remoteUrl}
						/>
					</FieldBlock>
					<div className="flex flex-wrap items-center gap-2 pt-1">
						<Button
							loading={actionBusy}
							onClick={() => void onSave(remoteName, remoteUrl)}
						>
							<Settings2 />
							{t('git.saveRemote')}
						</Button>
						<Button
							disabled={!canOperate}
							loading={actionBusy}
							onClick={onPull}
							variant="outline"
						>
							<Download />
							{t('git.pullAction')}
						</Button>
						<Button
							disabled={!canOperate}
							loading={actionBusy}
							onClick={onPush}
							variant="outline"
						>
							<Upload />
							{t('git.pushAction')}
						</Button>
					</div>
				</SettingsPanel>
			</SettingsSectionCard>
		</div>
	);
}
