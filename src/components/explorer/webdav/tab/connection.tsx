import { Cloud, Loader2, Save, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
	FieldBlock,
	SettingsSectionCard,
} from '@/components/system/setting/shared';
import type { WebDavConfig } from '@/invoke/webdav';

type WebDavTabConnectionProps = {
	config: WebDavConfig | null;
	password: string;
	testing: boolean;
	saving: boolean;
	onConfigChange: (config: WebDavConfig | null) => void;
	onPasswordChange: (password: string) => void;
	onTestConnection: () => void;
	onSaveConfig: () => void;
	onDeleteConfig: () => void;
};

export function WebDavTabConnection({
	config,
	password,
	testing,
	saving,
	onConfigChange,
	onPasswordChange,
	onTestConnection,
	onSaveConfig,
	onDeleteConfig,
}: WebDavTabConnectionProps) {
	return (
		<div className="size-full min-h-0 flex-1 overflow-auto">
			<div className="space-y-6 p-4 sm:p-6">
				<div className="space-y-1">
					<p
						className="text-xs font-medium uppercase tracking-[0.18em]
							text-muted-foreground"
					>
						连接
					</p>
					<h3 className="text-2xl font-semibold text-foreground">
						服务器与认证
					</h3>
				</div>

				<SettingsSectionCard title="服务器连接">
					<div className="space-y-3">
						<FieldBlock label="服务器地址">
							<Input
								placeholder="https://dav.example.com/remote.php/dav/files/user/"
								value={config?.url ?? ''}
								onChange={(e) =>
									onConfigChange(
										config ? { ...config, url: e.target.value || null } : null
									)
								}
							/>
						</FieldBlock>
						<FieldBlock label="用户名">
							<Input
								placeholder="username"
								value={config?.username ?? ''}
								onChange={(e) =>
									onConfigChange(
										config
											? { ...config, username: e.target.value || null }
											: null
									)
								}
							/>
						</FieldBlock>
						<FieldBlock label="密码">
							<Input
								type="password"
								placeholder="••••••••"
								value={password}
								onChange={(e) => onPasswordChange(e.target.value)}
							/>
						</FieldBlock>
						<div className="flex items-center gap-2 pt-1">
							<Button
								variant="outline"
								size="sm"
								onClick={onTestConnection}
								disabled={testing || !config?.url}
							>
								{testing ? (
									<Loader2 className="size-3.5 animate-spin" />
								) : (
									<Cloud className="size-3.5" />
								)}
								{testing ? '测试中…' : '测试连接'}
							</Button>
							<Button
								variant="default"
								size="sm"
								onClick={onSaveConfig}
								loading={saving}
								disabled={!config}
							>
								<Save className="size-3.5" />
								保存配置
							</Button>
							<Button
								variant="destructive"
								size="sm"
								onClick={onDeleteConfig}
								disabled={!config?.url && !config?.username}
							>
								<Trash2 className="size-3.5" />
								清除
							</Button>
						</div>
					</div>
				</SettingsSectionCard>
			</div>
		</div>
	);
}
