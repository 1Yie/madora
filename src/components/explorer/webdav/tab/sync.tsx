import { ArrowsClockwise as RefreshCw } from '@phosphor-icons/react';
import { useTranslation } from 'react-i18next';
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
	const { t } = useTranslation();
	const conflictStrategyLabels: Record<string, string> = {
		local_first: t('webdav.syncPanel.strategies.localFirst'),
		remote_first: t('webdav.syncPanel.strategies.remoteFirst'),
		keep_both: t('webdav.syncPanel.strategies.keepBoth'),
	};

	return (
		<div className="size-full min-h-0 flex-1 overflow-auto">
			<div className="space-y-6 p-4 sm:p-6">
				<SettingsSectionCard title={t('webdav.syncPanel.optionsTitle')}>
					<div className="space-y-3">
						<FieldBlock
							label={t('webdav.syncPanel.remoteSubdir')}
							hint={t('webdav.syncPanel.remoteSubdirHint')}
						>
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
						<FieldBlock label={t('webdav.syncPanel.conflictStrategy')}>
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
											conflictStrategyLabels[
												config?.conflict_strategy ?? 'local_first'
											]
										}
									</SelectValue>
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="local_first">
										{t('webdav.syncPanel.strategies.localFirst')}
									</SelectItem>
									<SelectItem value="remote_first">
										{t('webdav.syncPanel.strategies.remoteFirst')}
									</SelectItem>
									<SelectItem value="keep_both">
										{t('webdav.syncPanel.strategies.keepBoth')}
									</SelectItem>
								</SelectContent>
							</Select>
						</FieldBlock>
					</div>
				</SettingsSectionCard>

				<SettingsSectionCard title={t('webdav.syncPanel.manualTitle')}>
					<div className="space-y-3">
						<Button
							variant="default"
							size="sm"
							onClick={onSync}
							loading={syncing}
							disabled={!canSync || syncing}
						>
							<RefreshCw className="size-3.5" />
							{syncing
								? t('webdav.syncPanel.syncing')
								: t('webdav.syncPanel.syncNow')}
						</Button>

						{syncResult && (
							<div className="border-t border-border pt-3 text-sm">
								<div className="font-medium text-foreground">
									{t('webdav.syncPanel.resultsTitle')}
								</div>
								<div className="mt-2 space-y-1 text-xs text-muted-foreground">
									<p>
										{t('webdav.syncPanel.uploaded', {
											count: syncResult.files_uploaded,
										})}
									</p>
									<p>
										{t('webdav.syncPanel.downloaded', {
											count: syncResult.files_downloaded,
										})}
									</p>
									{syncResult.conflicts_resolved > 0 && (
										<p>
											{t('webdav.syncPanel.conflicts', {
												count: syncResult.conflicts_resolved,
											})}
										</p>
									)}
									{syncResult.errors.length > 0 && (
										<div className="mt-2">
											<p className="font-medium text-destructive">
												{t('webdav.syncPanel.errors', {
													count: syncResult.errors.length,
												})}
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
