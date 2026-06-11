import { RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from '@/components/ui/select';
import {
	FieldBlock,
	SettingsSectionCard,
} from '@/components/system/setting/shared';
import type { WebDavConfig, WebDavSyncResult } from '@/invoke/webdav';

const CONFLICT_STRATEGY_LABELS: Record<string, string> = {
	local_first: '本地优先',
	remote_first: '远端优先',
	keep_both: '保留两份（远端文件自动重命名）',
};

type WebDavTabSyncProps = {
	config: WebDavConfig | null;
	syncing: boolean;
	canSync: boolean;
	syncResult: WebDavSyncResult | null;
	onConfigChange: (config: WebDavConfig | null) => void;
	onSync: () => void;
};

export function WebDavTabSync({
	config,
	syncing,
	canSync,
	syncResult,
	onConfigChange,
	onSync,
}: WebDavTabSyncProps) {
	return (
		<div className="size-full min-h-0 flex-1 overflow-auto">
			<div className="space-y-6 p-4 sm:p-6">
				<div className="space-y-1">
					<p
						className="text-xs font-medium uppercase tracking-[0.18em]
							text-muted-foreground"
					>
						同步
					</p>
					<h3 className="text-2xl font-semibold text-foreground">
						同步操作与策略
					</h3>
				</div>

				<SettingsSectionCard title="同步选项">
					<div className="space-y-3">
						<FieldBlock label="远程子目录" hint="WebDAV 服务器上的子目录">
							<Input
								placeholder="madora-backup"
								value={config?.remote_subdir ?? ''}
								onChange={(e) =>
									onConfigChange(
										config
											? {
													...config,
													remote_subdir: e.target.value || null,
												}
											: null
									)
								}
							/>
						</FieldBlock>
						<FieldBlock label="冲突策略">
							<Select
								value={config?.conflict_strategy ?? 'local_first'}
								onValueChange={(val) =>
									onConfigChange(
										config
											? ({
													...config,
													conflict_strategy:
														val as WebDavConfig['conflict_strategy'],
												} as WebDavConfig)
											: null
									)
								}
							>
								<SelectTrigger className="w-full">
									<SelectValue>
										{
											CONFLICT_STRATEGY_LABELS[
												config?.conflict_strategy ?? 'local_first'
											]
										}
									</SelectValue>
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="local_first">本地优先</SelectItem>
									<SelectItem value="remote_first">远端优先</SelectItem>
									<SelectItem value="keep_both">
										保留两份（远端文件自动重命名）
									</SelectItem>
								</SelectContent>
							</Select>
						</FieldBlock>
					</div>
				</SettingsSectionCard>

				<SettingsSectionCard title="手动同步">
					<div className="space-y-3">
						<Button
							variant="default"
							size="sm"
							onClick={onSync}
							loading={syncing}
							disabled={!canSync || syncing}
						>
							<RefreshCw className="size-3.5" />
							{syncing ? '同步中…' : '立即同步'}
						</Button>

						{syncResult && (
							<div
								className="rounded-lg border border-border bg-background p-3
									text-sm"
							>
								<div className="font-medium text-foreground">同步结果</div>
								<div className="mt-2 space-y-1 text-xs text-muted-foreground">
									<p>上传: {syncResult.files_uploaded}</p>
									<p>下载: {syncResult.files_downloaded}</p>
									{syncResult.conflicts_resolved > 0 && (
										<p>冲突: {syncResult.conflicts_resolved}</p>
									)}
									{syncResult.errors.length > 0 && (
										<div className="mt-2">
											<p className="font-medium text-destructive">
												错误 ({syncResult.errors.length}):
											</p>
											<ul className="mt-1 list-inside list-disc">
												{syncResult.errors.map((err, i) => (
													<li key={i}>{err}</li>
												))}
											</ul>
										</div>
									)}
								</div>
							</div>
						)}
					</div>
				</SettingsSectionCard>
			</div>
		</div>
	);
}
