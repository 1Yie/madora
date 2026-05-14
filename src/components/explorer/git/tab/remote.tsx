import { useState } from 'react';

import { ArrowDownToLine, ArrowUpFromLine, Settings2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

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
			<div>
				<div className="text-base font-medium text-foreground">远端仓库</div>
				<p className="mt-1 text-xs text-muted-foreground">
					配置远端地址，并从这里发起拉取或推送。
				</p>
			</div>
			<div className="space-y-3">
				<Input
					nativeInput
					onChange={(event) => setRemoteName(event.target.value)}
					placeholder="origin"
					value={remoteName}
				/>
				<Input
					nativeInput
					onChange={(event) => setRemoteUrl(event.target.value)}
					placeholder="git@github.com:user/repo.git 或 https://github.com/user/repo.git"
					value={remoteUrl}
				/>
			</div>
			<div className="flex flex-wrap items-center gap-2">
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
	);
}
