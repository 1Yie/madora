import { useState } from 'react';

import { ArrowDownToLine, ArrowUpFromLine, Settings2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
	FieldBlock,
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
	const [remoteName, setRemoteName] = useState(initialRemoteName);
	const [remoteUrl, setRemoteUrl] = useState(initialRemoteUrl);

	return (
		<div className="space-y-4">
			<SettingsSectionCard title="远端仓库">
				<div className="space-y-3">
					<FieldBlock label="远端名称">
						<Input
							nativeInput
							onChange={(event) => setRemoteName(event.target.value)}
							placeholder="origin"
							value={remoteName}
						/>
					</FieldBlock>
					<FieldBlock label="远端地址">
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
							保存远端
						</Button>
						<Button
							disabled={!canOperate}
							loading={actionBusy}
							onClick={onPull}
							variant="outline"
						>
							<ArrowDownToLine />
							拉取
						</Button>
						<Button
							disabled={!canOperate}
							loading={actionBusy}
							onClick={onPush}
							variant="outline"
						>
							<ArrowUpFromLine />
							推送
						</Button>
					</div>
				</div>
			</SettingsSectionCard>
		</div>
	);
}
