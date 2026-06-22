// import { AlertTriangle, Check, Minus, Plus, RefreshCw } from 'lucide-react';
import { AlertTriangle, Check, Info, Minus, Plus } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { SettingsSectionCard } from '@/components/system/setting/shared';
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { useTranslation } from 'react-i18next';

import type { GitFileStatus, GitStatus } from '../git-types';

type GitTabCommitProps = {
	actionBusy: boolean;
	canOperate: boolean;
	commitMessage: string;
	status: GitStatus | null;
	onCommit: () => void;
	onCommitAll: () => void;
	onCommitMessageChange: (msg: string) => void;
	onRefresh: () => void;
	onStageFile: (path: string) => void;
	onUnstageFile: (path: string) => void;
};

const statusLabels: Record<string, string> = {
	added: 'A',
	conflicted: '!',
	deleted: 'D',
	modified: 'M',
	renamed: 'R',
	typechange: 'T',
	untracked: '?',
};

const statusColors: Record<string, string> = {
	added: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/30',
	conflicted: 'bg-red-500/10 text-red-500 border-red-500/30',
	deleted: 'bg-red-500/10 text-red-500 border-red-500/30',
	modified: 'bg-amber-500/10 text-amber-500 border-amber-500/30',
	renamed: 'bg-blue-500/10 text-blue-500 border-blue-500/30',
	typechange: 'bg-violet-500/10 text-violet-500 border-violet-500/30',
	untracked: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/30',
};

function FileBadge({ status }: { status: string }) {
	return (
		<span
			className={cn(
				`inline-flex shrink-0 items-center justify-center rounded border px-1
				text-[10px] font-semibold leading-[18px]`,
				statusColors[status] ?? 'bg-muted text-muted-foreground border-border'
			)}
		>
			{statusLabels[status] ?? status}
		</span>
	);
}

function getCommitLabel(
	status: GitStatus | null,
	t: (k: string, opts?: Record<string, string>) => string
): string {
	if (status?.conflictedFiles.length) {
		switch (status.repositoryState) {
			case 'revert':
				return t('git.commitLabel.reverting');
			case 'merge':
				return t('git.commitLabel.merging');
			case 'cherryPick':
				return t('git.commitLabel.cherryPicking');
			case 'rebase':
				return t('git.commitLabel.rebasing');
			default:
				return t('git.commitLabel.resolve');
		}
	}

	return t('git.commitLabel.commitStaged');
}

function getConflictHintText(
	conflictedFiles: GitFileStatus[],
	t: (k: string, opts?: Record<string, string | number>) => string
): string {
	const filesWithMarkers = conflictedFiles.filter(
		(file) => file.hasConflictMarkers
	).length;
	const filesWithoutMarkers = conflictedFiles.length - filesWithMarkers;

	if (filesWithMarkers > 0 && filesWithoutMarkers > 0) {
		return t('git.commitConflict.mixed', {
			with: String(filesWithMarkers),
			without: String(filesWithoutMarkers),
		});
	}

	if (filesWithMarkers > 0) {
		return t('git.commitConflict.resolveFirst');
	}

	return t('git.commitConflict.noMarkers');
}

export function GitTabCommit({
	actionBusy,
	canOperate,
	commitMessage,
	status,
	onCommit,
	onCommitAll,
	onCommitMessageChange,
	// onRefresh,
	onStageFile,
	onUnstageFile,
}: GitTabCommitProps) {
	const hasConflicts = (status?.conflictedFiles.length ?? 0) > 0;
	const { t } = useTranslation();
	const files = status?.files ?? [];
	const stagedFiles = files.filter(
		(f) => f.staged && f.status !== 'conflicted'
	);
	const unstagedFiles = files.filter(
		(f) => f.unstaged && f.status !== 'conflicted'
	);
	const conflictedFiles = files.filter((f) => f.status === 'conflicted');
	const hasFiles = files.length > 0;
	const hasStaged = stagedFiles.length > 0;
	const conflictHintText = getConflictHintText(conflictedFiles, t);

	return (
		<div className="flex h-full flex-col">
			<div className="shrink-0 space-y-4 px-6 pt-4 pb-4">
				<SettingsSectionCard title={t('git.commitMessage')}>
					<div className="space-y-3">
						<Textarea
							onChange={(event) => onCommitMessageChange(event.target.value)}
							placeholder={t('git.commitPlaceholder')}
							value={commitMessage}
						/>
						<div className="flex items-center gap-2">
							<Button
								disabled={!canOperate || !hasStaged}
								loading={actionBusy}
								onClick={onCommit}
							>
								<Check />
								{getCommitLabel(status, t)}
							</Button>
							<Button
								disabled={
									!canOperate || hasConflicts || !status?.totalChangedCount
								}
								onClick={onCommitAll}
								variant="outline"
							>
								<Check />
								{t('git.commitAll')}
							</Button>
						</div>
					</div>
				</SettingsSectionCard>
			</div>

			<div className="min-h-0 flex-1 flex flex-col overflow-hidden pt-2">
				{hasFiles ? (
					<div className="overflow-auto size-full min-h-0 flex-1 px-6 pb-6">
						<div className="space-y-3">
							{conflictedFiles.length > 0 && (
								<div>
									<div
										className="sticky top-0 z-10 flex items-center
											justify-between bg-popover pb-1.5 pt-0.5"
									>
										<div className="flex items-center gap-2">
											<span
												className="text-sm font-medium text-red-600
													dark:text-red-400"
											>
												{t('git.conflict')}
											</span>
											<Badge variant="destructive">
												{conflictedFiles.length}
											</Badge>
										</div>
										<span className="text-xs text-muted-foreground">
											{conflictHintText}
										</span>
									</div>
									<div
										className="rounded-lg border border-red-500/20 divide-y
											divide-border/40"
									>
										{conflictedFiles.map((file) => (
											<ConflictFileRow
												key={file.path}
												file={file}
												canOperate={canOperate}
												onStage={() => onStageFile(file.path)}
											/>
										))}
									</div>
								</div>
							)}
							{unstagedFiles.length > 0 && (
								<div>
									<div
										className="sticky top-0 z-10 flex items-center
											justify-between bg-popover pb-1.5 pt-0.5"
									>
										<div className="flex items-center gap-2">
											<span className="text-sm font-medium text-foreground">
												{t('git.changes')}
											</span>
											<Badge variant="secondary">{unstagedFiles.length}</Badge>
										</div>
										<Button
											disabled={!canOperate}
											onClick={() => {
												unstagedFiles.forEach((f) => onStageFile(f.path));
											}}
											size="xs"
											variant="outline"
										>
											<Plus />
											{t('git.stageAll')}
										</Button>
									</div>
									<div
										className="rounded-lg border border-border/60 divide-y
											divide-border/40"
									>
										{unstagedFiles.map((file) => (
											<FileRow
												key={file.path}
												file={file}
												canOperate={canOperate}
												actionIcon={<Plus className="size-3.5" />}
												actionLabel={t('git.stage')}
												onAction={() => onStageFile(file.path)}
											/>
										))}
									</div>
								</div>
							)}

							{stagedFiles.length > 0 && (
								<div>
									<div
										className="sticky top-0 z-10 flex items-center
											justify-between bg-popover pb-1.5 pt-0.5"
									>
										<div className="flex items-center gap-2">
											<span className="text-sm font-medium text-foreground">
												{t('git.staged')}
											</span>
											<Badge variant="secondary">{stagedFiles.length}</Badge>
										</div>
										<Button
											disabled={!canOperate}
											onClick={() => {
												stagedFiles.forEach((f) => onUnstageFile(f.path));
											}}
											size="xs"
											variant="outline"
										>
											<Minus />
											{t('git.unstageAll')}
										</Button>
									</div>
									<div
										className="rounded-lg border border-border/60 divide-y
											divide-border/40"
									>
										{stagedFiles.map((file) => (
											<FileRow
												key={file.path}
												file={file}
												canOperate={canOperate}
												actionIcon={<Minus className="size-3.5" />}
												actionLabel={t('git.unstage')}
												onAction={() => onUnstageFile(file.path)}
											/>
										))}
									</div>
								</div>
							)}
						</div>
					</div>
				) : (
					<div
						className="flex h-full flex-col items-center justify-center gap-3
							px-6 text-center"
					>
						<div className="text-sm text-muted-foreground">
							{t('git.noChanges')}
						</div>
					</div>
				)}
			</div>
		</div>
	);
}

function FileLabel({ file }: { file: GitFileStatus }) {
	const fileName = file.path.split('/').pop() ?? file.path;
	const parentDir = file.path.includes('/')
		? file.path.substring(0, file.path.lastIndexOf('/'))
		: null;

	return (
		<div className="min-w-0">
			<span className="truncate text-sm text-foreground">{fileName}</span>
			{parentDir && (
				<span className="ml-1.5 truncate text-xs text-muted-foreground/60">
					{parentDir}
				</span>
			)}
		</div>
	);
}

function FileRow({
	file,
	canOperate,
	actionIcon,
	actionLabel,
	onAction,
}: {
	file: GitFileStatus;
	canOperate: boolean;
	actionIcon: React.ReactNode;
	actionLabel: string;
	onAction: () => void;
}) {
	return (
		<div
			className="flex items-center justify-between px-3 py-1.5 hover:bg-muted/30
				transition-colors"
		>
			<div className="flex min-w-0 items-center gap-2">
				<FileBadge status={file.status} />
				<FileLabel file={file} />
			</div>
			<Button
				aria-label={actionLabel}
				disabled={!canOperate}
				onClick={onAction}
				size="icon-xs"
				variant="ghost"
				className="shrink-0"
			>
				{actionIcon}
			</Button>
		</div>
	);
}

function ConflictFileRow({
	file,
	canOperate,
	onStage,
}: {
	file: GitFileStatus;
	canOperate: boolean;
	onStage: () => void;
}) {
	const { t } = useTranslation();
	const hasMarkers = file.hasConflictMarkers;
	return (
		<div
			className="flex items-center justify-between px-3 py-1.5 hover:bg-muted/30
				transition-colors"
		>
			<div className="flex min-w-0 items-center gap-2">
				<FileBadge status={file.status} />
				<FileLabel file={file} />
				<Tooltip>
					<TooltipTrigger>
						{hasMarkers ? (
							<AlertTriangle className="size-3.5 shrink-0 text-amber-500" />
						) : (
							<Info className="size-3.5 shrink-0 text-info" />
						)}
					</TooltipTrigger>
					<TooltipContent>
						{hasMarkers
							? t('git.commitConflict.markerTooltip')
							: t('git.commitConflict.noMarkerTooltip')}
					</TooltipContent>
				</Tooltip>
			</div>
			<div className="flex items-center gap-1">
				{hasMarkers ? (
					<span
						className="inline-flex items-center justify-center size-6 rounded-sm
							text-muted-foreground/40 cursor-not-allowed"
						title={t('git.commitConflict.markerWarning')}
					>
						<Plus className="size-3.5" />
					</span>
				) : (
					<Button
						aria-label={t('git.commitConflict.stageAndResolve')}
						disabled={!canOperate}
						onClick={onStage}
						size="icon-xs"
						variant="ghost"
						className="shrink-0"
					>
						<Plus className="size-3.5" />
					</Button>
				)}
			</div>
		</div>
	);
}
