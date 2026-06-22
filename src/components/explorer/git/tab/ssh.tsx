import { useTranslation } from 'react-i18next';
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
	const { t } = useTranslation();

	return (
		<div className="space-y-4">
			<SettingsSectionCard title={t('git.sshAuth')}>
				<div className="space-y-3">
					<FieldBlock label={t('git.sshUsername')}>
						<Input
							nativeInput
							onChange={(event) => onSshUsernameChange(event.target.value)}
							placeholder="git"
							value={sshUsername}
						/>
					</FieldBlock>
					<FieldBlock label={t('git.sshKeyPath')}>
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
								{t('git.selectFile')}
							</Button>
						</div>
					</FieldBlock>
					<FieldBlock label={t('git.sshPassphrase')}>
						<Input
							nativeInput
							onChange={(event) => onSshPassphraseChange(event.target.value)}
							placeholder={t('git.passphrasePlaceholder')}
							type="password"
							value={sshPassphrase}
						/>
					</FieldBlock>
				</div>
			</SettingsSectionCard>
			<SettingsSectionCard title={t('git.httpsAuth')}>
				<div className="space-y-3">
					<FieldBlock label={t('git.httpsUsername')}>
						<Input
							nativeInput
							onChange={(event) => onAuthUsernameChange(event.target.value)}
							placeholder={t('git.httpsUsername')}
							value={authUsername}
						/>
					</FieldBlock>
					<FieldBlock label={t('git.httpsPassword')}>
						<Input
							nativeInput
							onChange={(event) => onAuthPasswordChange(event.target.value)}
							placeholder={t('git.tokenOrPassword')}
							type="password"
							value={authPassword}
						/>
					</FieldBlock>
				</div>
			</SettingsSectionCard>
		</div>
	);
}
