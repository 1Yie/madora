import { FolderKey } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
	FieldBlock,
	SettingsSectionCard,
} from '@/components/system/setting/shared';

type GitTabSshProps = {
	actionBusy: boolean;
	authPassword: string;
	authUsername: string;
	sshPassphrase: string;
	sshPrivateKeyPath: string;
	sshUsername: string;
	onAuthPasswordChange: (v: string) => void;
	onAuthUsernameChange: (v: string) => void;
	onPickKeyFile: () => void;
	onSshPassphraseChange: (v: string) => void;
	onSshPrivateKeyPathChange: (v: string) => void;
	onSshUsernameChange: (v: string) => void;
};

export function GitTabSsh({
	actionBusy,
	authPassword,
	authUsername,
	sshPassphrase,
	sshPrivateKeyPath,
	sshUsername,
	onAuthPasswordChange,
	onAuthUsernameChange,
	onPickKeyFile,
	onSshPassphraseChange,
	onSshPrivateKeyPathChange,
	onSshUsernameChange,
}: GitTabSshProps) {
	return (
		<div className="space-y-4">
			<SettingsSectionCard title="SSH 认证">
				<div className="space-y-3">
					<FieldBlock label="SSH 用户名">
						<Input
							nativeInput
							onChange={(event) => onSshUsernameChange(event.target.value)}
							placeholder="git"
							value={sshUsername}
						/>
					</FieldBlock>
					<FieldBlock label="SSH 私钥路径">
						<div className="flex gap-2">
							<Input
								className="flex-1"
								nativeInput
								onChange={(event) =>
									onSshPrivateKeyPathChange(event.target.value)
								}
								placeholder="~/.ssh/id_ed25519"
								value={sshPrivateKeyPath}
							/>
							<Button
								disabled={actionBusy}
								onClick={onPickKeyFile}
								variant="outline"
							>
								<FolderKey />
								选择文件
							</Button>
						</div>
					</FieldBlock>
					<FieldBlock label="SSH 私钥口令">
						<Input
							nativeInput
							onChange={(event) => onSshPassphraseChange(event.target.value)}
							placeholder="口令"
							type="password"
							value={sshPassphrase}
						/>
					</FieldBlock>
				</div>
			</SettingsSectionCard>
			<SettingsSectionCard title="HTTPS 认证">
				<div className="space-y-3">
					<FieldBlock label="HTTPS 用户名">
						<Input
							nativeInput
							onChange={(event) => onAuthUsernameChange(event.target.value)}
							placeholder="HTTPS 用户名"
							value={authUsername}
						/>
					</FieldBlock>
					<FieldBlock label="HTTPS 密码">
						<Input
							nativeInput
							onChange={(event) => onAuthPasswordChange(event.target.value)}
							placeholder="Token 或密码"
							type="password"
							value={authPassword}
						/>
					</FieldBlock>
				</div>
			</SettingsSectionCard>
		</div>
	);
}
