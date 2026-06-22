import {
	gitCommit,
	gitCommitAll,
	gitCreateBranch,
	gitFetch,
	gitInit,
	gitListBranches,
	gitLoadCredentials,
	gitLog as fetchGitLog,
	gitPickSshPrivateKeyFile,
	gitPull,
	gitPush,
	gitRevertCommit,
	gitSetRemote,
	gitStageFile,
	gitStoreCredentials,
	gitSwitchBranch,
	gitUndoLastCommit,
	gitUnstageFile,
} from '@/invoke/git';
import {
	ArrowDownToLine,
	ArrowUpFromLine,
	Check,
	GitBranch,
	History,
	KeyRound,
	LoaderCircle,
	Plus,
	RefreshCw,
	Settings2,
	XIcon,
	type LucideIcon,
} from 'lucide-react';
import { useCallback, useEffect, Fragment, useRef, useState } from 'react';

import { Button } from '@/components/ui/button';
import {
	Dialog,
	DialogClose,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogPopup,
	DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { DialogSidebar } from '@/components/ui/dialog-sidebar';
import { Popover, PopoverPopup, PopoverTrigger } from '@/components/ui/popover';
import { showErrorToast, showSuccessToast } from '@/components/ui/toast';
import { useTranslation } from 'react-i18next';
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

import { GitTabCommit } from './tab/commit';
import { GitTabHistory } from './tab/history';
import { GitTabRemote } from './tab/remote';
import { GitTabSsh } from './tab/ssh';

import type {
	GitAuth,
	GitBranchInfo,
	GitCredentials,
	GitLogEntry,
	GitStatus,
} from './git-types';

type GitPanelProps = {
	disabled?: boolean;
	rootPath: string | null;
	status: GitStatus | null;
	busy: boolean;
	onRefresh: () => Promise<void>;
	onRefreshWorkspace: () => Promise<void>;
	onStatusChange: (status: GitStatus) => void;
};

type GitWorkbenchTab = 'commit' | 'history' | 'remote' | 'ssh';

type GitHistoryAction =
	| { type: 'undo-last' }
	| { type: 'revert-commit'; commitId: string; summary: string }
	| null;

const CREDENTIALS_DEBOUNCE_MS = 2000;

type GitSummaryPart = {
	key: string;
	text: string;
	icon?: LucideIcon;
};

function getBranchLabel(
	status: GitStatus | null,
	t: (k: string) => string
): string {
	if (!status?.branch?.name) {
		return t('git.status.notInitialized');
	}

	return status.branch.name;
}

function getConflictSummary(
	status: GitStatus,
	t: (k: string, opts?: Record<string, unknown>) => string
): string | null {
	if (status.conflictedFiles.length === 0) {
		return null;
	}

	switch (status.repositoryState) {
		case 'revert':
			return t('git.status.reverting', {
				count: status.conflictedFiles.length,
			});
		case 'merge':
			return t('git.status.merging', { count: status.conflictedFiles.length });
		case 'cherryPick':
			return t('git.status.cherryPicking', {
				count: status.conflictedFiles.length,
			});
		case 'rebase':
			return t('git.status.rebasing', { count: status.conflictedFiles.length });
		default:
			return t('git.status.conflicts', {
				count: status.conflictedFiles.length,
			});
	}
}

function getSummaryParts(
	status: GitStatus,
	t: (k: string, opts?: Record<string, unknown>) => string
): GitSummaryPart[] {
	const parts: GitSummaryPart[] = [];

	if (status.totalChangedCount === 0) {
		parts.push({ key: 'clean', text: t('git.status.clean') });
	} else {
		parts.push({
			icon: Check,
			key: 'staged',
			text: t('git.status.staged', { count: status.stagedCount }),
		});
		parts.push({
			icon: Plus,
			key: 'unstaged',
			text: t('git.status.unstaged', { count: status.unstagedCount }),
		});
	}

	if (status.branch?.ahead) {
		parts.push({
			icon: ArrowUpFromLine,
			key: 'ahead',
			text: t('git.status.ahead', { count: status.branch.ahead }),
		});
	}

	if (status.branch?.behind) {
		parts.push({
			icon: ArrowDownToLine,
			key: 'behind',
			text: t('git.status.behind', { count: status.branch.behind }),
		});
	}

	return parts;
}

function getSummary(
	status: GitStatus | null,
	t: (k: string, opts?: Record<string, unknown>) => string
): string {
	if (!status) {
		return t('git.status.loading');
	}

	if (!status.hasRepository) {
		return t('git.status.notARepo');
	}

	const conflictSummary = getConflictSummary(status, t);

	if (conflictSummary) {
		return conflictSummary;
	}

	return getSummaryParts(status, t)
		.map((part) => part.text)
		.join(' · ');
}

function GitSummaryIcons({
	className,
	status,
}: {
	className?: string;
	status: GitStatus | null;
}) {
	const { t } = useTranslation();

	if (!status) {
		return t('git.status.loading');
	}
	if (!status.hasRepository) {
		return t('git.status.notARepo');
	}

	const conflictSummary = getConflictSummary(status, t);

	if (conflictSummary) {
		return conflictSummary;
	}

	return (
		<span
			className={cn(
				'flex min-w-0 flex-wrap items-center gap-x-1 gap-y-0.5 leading-4',
				className
			)}
		>
			{getSummaryParts(status, t).map((part, index) => {
				const Icon = part.icon;

				return (
					<Fragment key={part.key}>
						{index > 0 ? (
							<span className="shrink-0 leading-4 text-muted-foreground">
								·
							</span>
						) : null}
						<span className="flex min-w-0 items-center gap-1 leading-4">
							{Icon ? (
								<span
									className="inline-flex size-3.5 shrink-0 items-center
										justify-center"
								>
									<Icon className="size-3 shrink-0" />
								</span>
							) : null}
							<span className="min-w-0 leading-4">{part.text}</span>
						</span>
					</Fragment>
				);
			})}
		</span>
	);
}

export function GitPanel({
	disabled = false,
	rootPath,
	status,
	busy,
	onRefresh,
	onRefreshWorkspace,
	onStatusChange,
}: GitPanelProps) {
	const { t } = useTranslation();

	const workbenchSections = [
		{
			id: 'commit' as GitWorkbenchTab,
			label: t('git.tab.commit'),
			description: t('git.tab.commitDesc'),
			icon: Check,
		},
		{
			id: 'history' as GitWorkbenchTab,
			label: t('git.tab.history'),
			description: t('git.tab.historyDesc'),
			icon: History,
		},
		{
			id: 'remote' as GitWorkbenchTab,
			label: t('git.tab.remote'),
			description: t('git.tab.remoteDesc'),
			icon: Settings2,
		},
		{
			id: 'ssh' as GitWorkbenchTab,
			label: 'SSH',
			description: t('git.tab.authDesc'),
			icon: KeyRound,
		},
	];

	const [workbenchOpen, setWorkbenchOpen] = useState(false);
	const [activeTab, setActiveTab] = useState<GitWorkbenchTab>('commit');
	const [actionBusy, setActionBusy] = useState(false);
	const [commitMessage, setCommitMessage] = useState('');
	const [authUsername, setAuthUsername] = useState('');
	const [authPassword, setAuthPassword] = useState('');
	const [sshUsername, setSshUsername] = useState('git');
	const [sshPrivateKeyPath, setSshPrivateKeyPath] = useState('');
	const [sshPassphrase, setSshPassphrase] = useState('');
	const [gitLog, setGitLog] = useState<GitLogEntry[]>([]);
	const [pendingHistoryAction, setPendingHistoryAction] =
		useState<GitHistoryAction>(null);
	const [branches, setBranches] = useState<GitBranchInfo[]>([]);
	const [branchPopoverOpen, setBranchPopoverOpen] = useState(false);
	const [newBranchName, setNewBranchName] = useState('');
	const [branchActionBusy, setBranchActionBusy] = useState(false);
	const [branchesLoaded, setBranchesLoaded] = useState(false);
	const [remoteName, setRemoteName] = useState('');

	const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

	const persistCredentials = useCallback((creds: GitCredentials) => {
		if (saveTimerRef.current !== null) {
			clearTimeout(saveTimerRef.current);
		}
		saveTimerRef.current = setTimeout(() => {
			saveTimerRef.current = null;
			void gitStoreCredentials({ credentials: creds });
		}, CREDENTIALS_DEBOUNCE_MS);
	}, []);

	useEffect(() => {
		void (async () => {
			try {
				const creds = await gitLoadCredentials();
				setAuthUsername(creds.authUsername ?? '');
				setAuthPassword(creds.authPassword ?? '');
				setSshUsername(creds.sshUsername || 'git');
				setSshPrivateKeyPath(creds.sshPrivateKeyPath ?? '');
				setSshPassphrase(creds.sshPassphrase ?? '');
			} catch {
				// No saved credentials yet — keep defaults
			}
		})();
	}, []);

	useEffect(() => {
		persistCredentials({
			authUsername: authUsername.trim(),
			authPassword: authPassword.trim(),
			sshUsername: sshUsername.trim(),
			sshPrivateKeyPath: sshPrivateKeyPath.trim(),
			sshPassphrase: sshPassphrase.trim(),
		});
	}, [
		authUsername,
		authPassword,
		sshUsername,
		sshPrivateKeyPath,
		sshPassphrase,
		persistCredentials,
	]);

	useEffect(() => {
		return () => {
			if (saveTimerRef.current !== null) {
				clearTimeout(saveTimerRef.current);
			}
		};
	}, []);

	const canOperate = Boolean(rootPath) && !disabled && !busy && !actionBusy;

	const primaryRemote =
		status?.remotes.find((remote) => remote.name === 'origin') ??
		status?.remotes[0] ??
		null;

	const buildAuth = (): GitAuth | null => {
		const username = authUsername.trim();
		const password = authPassword.trim();
		const normalizedSshUsername = sshUsername.trim();
		const normalizedSshPrivateKeyPath = sshPrivateKeyPath.trim();
		const normalizedSshPassphrase = sshPassphrase.trim();

		if (
			!username &&
			!password &&
			!normalizedSshUsername &&
			!normalizedSshPrivateKeyPath &&
			!normalizedSshPassphrase
		) {
			return null;
		}

		return {
			password: password || null,
			sshPassphrase: normalizedSshPassphrase || null,
			sshPrivateKeyPath: normalizedSshPrivateKeyPath || null,
			sshUsername: normalizedSshUsername || null,
			username: username || null,
		};
	};

	const runAction = async <T,>(
		action: () => Promise<T>,
		successMessage?: string,
		setBusy: (busy: boolean) => void = setActionBusy
	): Promise<T | null> => {
		setBusy(true);

		try {
			const result = await action();

			if (successMessage) {
				showSuccessToast(successMessage);
			}

			return result;
		} catch (error) {
			showErrorToast(
				t('git.gitOperationFailed'),
				error instanceof Error ? error.message : String(error)
			);
			return null;
		} finally {
			setBusy(false);
		}
	};

	const loadGitLog = useCallback(async () => {
		if (!rootPath || !status?.hasRepository) {
			setGitLog([]);
			return;
		}

		try {
			const entries = await fetchGitLog({ limit: null, rootPath });
			setGitLog(entries);
		} catch {
			setGitLog([]);
		}
	}, [rootPath, status?.hasRepository]);

	const refreshStatus = useCallback(async () => {
		await onRefresh();
	}, [onRefresh]);

	const loadBranches = async () => {
		if (!rootPath || !status?.hasRepository) {
			return;
		}

		try {
			const list = await gitListBranches({ rootPath });
			setBranches(list);
		} catch (error) {
			showErrorToast(
				t('git.fetchBranchListFailed'),
				error instanceof Error ? error.message : String(error)
			);
		} finally {
			setBranchesLoaded(true);
		}
	};

	const switchBranch = async (branchName: string) => {
		if (!rootPath) return;

		const nextStatus = await runAction(
			() => gitSwitchBranch({ rootPath, branchName }),
			undefined,
			setBranchActionBusy
		);

		if (nextStatus) {
			setBranchPopoverOpen(false);
			onStatusChange(nextStatus);
			await refreshStatus();
			await onRefreshWorkspace();
		} else {
			setBranchPopoverOpen(false);
		}
	};

	const createBranch = async () => {
		if (!rootPath || !newBranchName.trim()) {
			return;
		}

		setBranchActionBusy(true);

		try {
			await gitCreateBranch({ rootPath, branchName: newBranchName.trim() });
			setNewBranchName('');
			setBranchPopoverOpen(false);
			await refreshStatus();
		} catch (error) {
			showErrorToast(
				t('git.createBranchFailed'),
				error instanceof Error ? error.message : String(error)
			);
		} finally {
			setBranchActionBusy(false);
		}
	};

	const handleBranchPopoverOpen = (open: boolean) => {
		setBranchPopoverOpen(open);

		if (open) {
			setBranchesLoaded(false);
			void loadBranches();
		}
	};

	const initRepository = async () => {
		if (!rootPath) {
			return;
		}

		const nextStatus = await runAction(
			() => gitInit({ rootPath }),
			t('git.initSuccess')
		);

		if (nextStatus) {
			onStatusChange(nextStatus);
			setWorkbenchOpen(true);
		}
	};

	const saveRemote = async (remoteName: string, remoteUrl: string) => {
		if (!rootPath) {
			return;
		}

		const trimmedName = remoteName.trim();
		const trimmedUrl = remoteUrl.trim();

		if (!trimmedName || !trimmedUrl) {
			showErrorToast(t('git.remoteSaveFailed'), t('git.remoteSaveFailedHint'));
			return;
		}

		const nextStatus = await runAction(
			() =>
				gitSetRemote({
					remoteName: trimmedName,
					remoteUrl: trimmedUrl,
					rootPath,
				}),
			t('git.remoteSaved')
		);

		if (nextStatus) {
			onStatusChange(nextStatus);
			await loadGitLog();
		}
	};

	const commitStaged = async () => {
		if (!rootPath) {
			return;
		}

		const trimmedMessage = commitMessage.trim();

		if (!trimmedMessage) {
			showErrorToast(t('git.commitFailed'), t('git.commitMessageRequired'));
			return;
		}

		const result = await runAction(
			() =>
				gitCommit({
					authorEmail: null,
					authorName: null,
					message: trimmedMessage,
					rootPath,
				}),
			t('git.commitSuccess')
		);

		if (result) {
			setCommitMessage('');
			await refreshStatus();
			await loadGitLog();
			setActiveTab('history');
		}
	};

	const commitAll = async () => {
		if (!rootPath) {
			return;
		}

		const trimmedMessage = commitMessage.trim();

		if (!trimmedMessage) {
			showErrorToast(t('git.commitFailed'), t('git.commitMessageRequired'));
			return;
		}

		const result = await runAction(
			() =>
				gitCommitAll({
					authorEmail: null,
					authorName: null,
					message: trimmedMessage,
					rootPath,
				}),
			t('git.commitSuccess')
		);

		if (result) {
			setCommitMessage('');
			await refreshStatus();
			await loadGitLog();
			setActiveTab('history');
		}
	};

	const stageFile = async (filePath: string) => {
		if (!rootPath) {
			return;
		}

		const nextStatus = await runAction(() =>
			gitStageFile({ path: filePath, rootPath })
		);

		if (nextStatus) {
			onStatusChange(nextStatus);
		}
	};

	const unstageFile = async (filePath: string) => {
		if (!rootPath) {
			return;
		}

		const nextStatus = await runAction(() =>
			gitUnstageFile({ path: filePath, rootPath })
		);

		if (nextStatus) {
			onStatusChange(nextStatus);
		}
	};

	const push = async () => {
		if (!rootPath) {
			return;
		}

		const result = await runAction(
			() =>
				gitPush({
					auth: buildAuth(),
					branchName: status?.branch?.name ?? null,
					remoteName: remoteName.trim() || primaryRemote?.name || 'origin',
					rootPath,
				}),
			t('git.pushSuccess')
		);

		if (result) {
			await refreshStatus();
			await loadGitLog();
			setActiveTab('history');
		}
	};

	const pull = async () => {
		if (!rootPath) {
			return;
		}

		const result = await runAction(
			() =>
				gitPull({
					auth: buildAuth(),
					authorEmail: null,
					authorName: null,
					branchName: status?.branch?.name ?? null,
					remoteName: remoteName.trim() || primaryRemote?.name || 'origin',
					rootPath,
				}),
			t('git.pullComplete')
		);

		if (result) {
			if (result.conflicts.length > 0) {
				showErrorToast(t('git.mergeConflicts'), result.conflicts.join('\n'));
			}

			await refreshStatus();
			await loadGitLog();
			setActiveTab('history');
		}
	};

	const fetchRemote = async () => {
		if (!rootPath) {
			return;
		}

		const result = await runAction(
			() =>
				gitFetch({
					auth: buildAuth(),
					remoteName: remoteName.trim() || primaryRemote?.name || 'origin',
					rootPath,
				}),
			t('git.fetchComplete')
		);

		if (result) {
			onStatusChange(result);
			await loadGitLog();
		}
	};

	const pickSshPrivateKeyFile = async () => {
		setActionBusy(true);

		try {
			const selectedPath = await gitPickSshPrivateKeyFile();

			if (selectedPath) {
				setSshPrivateKeyPath(selectedPath);
				showSuccessToast(t('git.sshKeySelected'));
			}
		} catch (error) {
			showErrorToast(
				t('git.selectFileFailed'),
				error instanceof Error ? error.message : String(error)
			);
		} finally {
			setActionBusy(false);
		}
	};

	const undoLastCommit = async () => {
		if (!rootPath) {
			return;
		}

		const result = await runAction(
			() => gitUndoLastCommit({ rootPath }),
			t('git.undoSuccess')
		);

		if (result) {
			await refreshStatus();
			await loadGitLog();
		}
	};

	const revertHistoryCommit = async (commitId: string) => {
		if (!rootPath) {
			return;
		}

		const result = await runAction(
			() =>
				gitRevertCommit({
					authorEmail: null,
					authorName: null,
					commitId,
					rootPath,
				}),
			t('git.revertSuccess')
		);

		if (result) {
			if (result.conflicts.length > 0) {
				showErrorToast(t('git.revertConflicts'), result.conflicts.join('\n'));
			}

			await refreshStatus();
			await loadGitLog();
		}
	};

	const openWorkbench = (nextTab: GitWorkbenchTab = 'commit') => {
		setActiveTab(nextTab);
		setWorkbenchOpen(true);

		if (nextTab === 'history') {
			void loadGitLog();
		}
	};

	const branchLabel = getBranchLabel(status, t);
	const summary = getSummary(status, t);
	const statusTooltip = `${branchLabel} · ${summary}`;
	const upstreamLabel = status?.branch?.upstream ?? null;

	return (
		<>
			<div
				className="flex min-w-0 flex-1 items-center justify-between gap-2 px-2"
			>
				{status?.hasRepository ? (
					<Popover
						onOpenChange={handleBranchPopoverOpen}
						open={branchPopoverOpen}
					>
						<Tooltip>
							<TooltipTrigger
								className="flex min-w-0 flex-1 items-center gap-2
									overflow-hidden rounded-md px-2 py-1 text-left leading-4
									text-muted-foreground outline-none hover:bg-sidebar-accent/60"
								render={
									<PopoverTrigger
										aria-label={statusTooltip}
										className="flex min-w-0 flex-1 items-center gap-2
											overflow-hidden rounded-md px-2 py-1 text-left leading-4
											text-muted-foreground outline-none
											hover:bg-sidebar-accent/60"
									>
										{busy || actionBusy || branchActionBusy ? (
											<LoaderCircle
												className="size-3.5 shrink-0 animate-spin text-primary"
											/>
										) : (
											<GitBranch className="size-3.5 shrink-0 text-primary" />
										)}
										<div
											className="flex min-w-0 flex-1 items-center gap-2
												overflow-hidden"
										>
											<span
												className="max-w-[45%] shrink truncate font-medium
													text-foreground"
											>
												{branchLabel}
											</span>
											<span className="min-w-0 flex-1 truncate">{summary}</span>
										</div>
									</PopoverTrigger>
								}
							>
								{busy || actionBusy || branchActionBusy ? (
									<LoaderCircle
										className="size-3.5 shrink-0 animate-spin text-primary"
									/>
								) : (
									<GitBranch className="size-3.5 shrink-0 text-primary" />
								)}
								<div
									className="flex min-w-0 flex-1 items-center gap-2
										overflow-hidden"
								>
									<span
										className="max-w-[45%] shrink truncate font-medium
											text-foreground"
									>
										{branchLabel}
									</span>
									<span className="min-w-0 flex-1 truncate">{summary}</span>
								</div>
							</TooltipTrigger>
							<TooltipContent className="max-w-80" side="top">
								<div className="flex min-w-0 items-center gap-1.5">
									<span className="shrink-0 font-medium text-foreground">
										{branchLabel}
									</span>
									<span className="text-muted-foreground">·</span>
									<GitSummaryIcons status={status} />
								</div>
							</TooltipContent>
						</Tooltip>
						<PopoverPopup className="p-0 m-0">
							<div className="flex max-h-80 flex-col gap-2">
								<div
									className="size-full min-h-0 flex-1"
									style={{ overflow: 'auto' }}
								>
									{branches.length === 0 ? (
										<p
											className="px-3 py-4 text-center text-xs
												text-muted-foreground"
										>
											{branchesLoaded ? t('git.noBranches') : t('git.loading')}
										</p>
									) : (
										branches.map((branch) => (
											<Button
												key={branch.name}
												type="button"
												variant={branch.isHead ? 'secondary' : 'ghost'}
												disabled={branch.isHead || branchActionBusy}
												className={cn(
													`flex w-full items-center rounded-full gap-2 px-3 py-2
														text-left text-sm h-auto justify-start font-normal`
												)}
												onClick={() => void switchBranch(branch.name)}
											>
												<GitBranch className="size-3.5 shrink-0" />
												<span className="truncate">{branch.name}</span>
												{branch.isHead ? (
													<span
														className="ml-auto shrink-0 text-[10px] font-medium
															text-muted-foreground"
													>
														{t('common.status.current')}
													</span>
												) : null}
											</Button>
										))
									)}
								</div>
								<div className="shrink-0 border-border">
									<div className="flex items-center gap-2">
										<Input
											className="flex-1 rounded-full"
											disabled={branchActionBusy}
											nativeInput
											onChange={(event) => setNewBranchName(event.target.value)}
											onKeyDown={(event) => {
												if (event.key === 'Enter') {
													event.preventDefault();
													void createBranch();
												}
											}}
											value={newBranchName}
										/>
										<Button
											disabled={!newBranchName.trim() || branchActionBusy}
											onClick={() => void createBranch()}
											size="icon-lg"
											className="rounded-full"
											variant="outline"
										>
											<Plus />
										</Button>
									</div>
								</div>
							</div>
						</PopoverPopup>
					</Popover>
				) : (
					<Tooltip>
						<TooltipTrigger
							className="flex min-w-0 flex-1 items-center gap-2 overflow-hidden
								rounded-md px-2 py-1 text-left leading-4 text-muted-foreground
								outline-none"
							render={
								<button
									aria-label={statusTooltip}
									className="flex min-w-0 flex-1 items-center gap-2
										overflow-hidden rounded-md px-2 py-1 text-left leading-4
										text-muted-foreground outline-none
										hover:bg-sidebar-accent/60"
									type="button"
								/>
							}
						>
							{busy || actionBusy ? (
								<LoaderCircle
									className="size-3.5 shrink-0 animate-spin text-primary"
								/>
							) : (
								<GitBranch className="size-3.5 shrink-0 text-primary" />
							)}
							<div
								className="flex min-w-0 flex-1 items-center gap-2
									overflow-hidden"
							>
								<span
									className="max-w-[45%] shrink truncate font-medium
										text-foreground"
								>
									{branchLabel}
								</span>
								<span className="min-w-0 flex-1 truncate">{summary}</span>
							</div>
						</TooltipTrigger>
						<TooltipContent className="max-w-80" side="top">
							<div className="flex min-w-0 items-center gap-1.5">
								<span className="shrink-0 font-medium text-foreground">
									{branchLabel}
								</span>
								<span className="text-muted-foreground">·</span>
								<GitSummaryIcons status={status} />
							</div>
						</TooltipContent>
					</Tooltip>
				)}
				<div
					className="flex shrink-0 items-center gap-1.5 text-muted-foreground"
				>
					{!status?.hasRepository && status?.hasGitDirectory ? (
						<span className="text-xs text-muted-foreground whitespace-nowrap">
							{t('git.notMadoraRepo')}
						</span>
					) : !status?.hasRepository ? (
						<Button
							disabled={!canOperate}
							onClick={() => void initRepository()}
							size="xs"
							variant="outline"
						>
							<Plus />
							{t('git.init')}
						</Button>
					) : (
						<>
							<Button
								disabled={!canOperate}
								onClick={() => void fetchRemote()}
								size="icon-xs"
								variant="ghost"
							>
								<ArrowDownToLine />
							</Button>
							<Button
								disabled={!canOperate}
								onClick={() => openWorkbench('remote')}
								size="icon-xs"
								variant="ghost"
							>
								<Settings2 />
							</Button>
							<Button
								disabled={!canOperate}
								onClick={() => openWorkbench('history')}
								size="icon-xs"
								variant="ghost"
							>
								<History />
							</Button>
							<Button
								disabled={!canOperate}
								onClick={() => openWorkbench('commit')}
								size="icon-xs"
								variant="ghost"
							>
								<Check />
							</Button>
						</>
					)}
					<Button
						disabled={!canOperate}
						onClick={() => void refreshStatus()}
						size="icon-xs"
						variant="ghost"
					>
						<RefreshCw />
					</Button>
				</div>
			</div>

			<Dialog onOpenChange={setWorkbenchOpen} open={workbenchOpen}>
				<DialogPopup
					showCloseButton={false}
					className="max-h-[calc(100vh-3rem)] max-w-[calc(100vw-3rem)]
						overflow-hidden"
				>
					<div
						className="flex h-[calc(100vh-5rem)] min-h-0 min-w-0 flex-col
							overflow-hidden"
					>
						<DialogClose
							className="absolute inset-e-2 top-2 z-10"
							render={<Button size="icon" variant="ghost" />}
						>
							<XIcon />
						</DialogClose>
						<div
							className="flex min-h-0 min-w-0 flex-1 flex-row overflow-hidden"
						>
							<DialogSidebar
								items={workbenchSections}
								activeId={activeTab}
								onSelect={(id) => {
									if (id === 'history') void loadGitLog();
									setActiveTab(id as GitWorkbenchTab);
								}}
							/>
							<section
								className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden
									bg-popover"
							>
								{activeTab === 'history' && (
									<>
										<div className="space-y-1 px-6 pt-4 sm:pt-6">
											<p
												className="text-xs font-medium uppercase
													tracking-[0.18em] text-muted-foreground"
											>
												{t('git.tab.history')}
											</p>
											<h3 className="text-2xl font-semibold text-foreground">
												{t('git.tab.historyDesc')}
											</h3>
										</div>
										<GitTabHistory
											actionBusy={actionBusy}
											branchLabel={branchLabel}
											gitLog={gitLog}
											upstreamLabel={upstreamLabel}
											onRevertRequest={(commitId, summary) =>
												setPendingHistoryAction({
													type: 'revert-commit',
													commitId,
													summary,
												})
											}
											onUndoRequest={() =>
												setPendingHistoryAction({ type: 'undo-last' })
											}
										/>
									</>
								)}
								{activeTab === 'commit' && (
									<>
										<div className="space-y-1 px-6 pt-4 sm:pt-6">
											<p
												className="text-xs font-medium uppercase
													tracking-[0.18em] text-muted-foreground"
											>
												{t('git.tab.commit')}
											</p>
											<h3 className="text-2xl font-semibold text-foreground">
												{t('git.tab.commitDesc')}
											</h3>
										</div>
										<GitTabCommit
											actionBusy={actionBusy}
											canOperate={canOperate}
											commitMessage={commitMessage}
											status={status}
											onCommit={() => void commitStaged()}
											onCommitAll={() => void commitAll()}
											onCommitMessageChange={setCommitMessage}
											onRefresh={() => void refreshStatus()}
											onStageFile={(path) => void stageFile(path)}
											onUnstageFile={(path) => void unstageFile(path)}
										/>
									</>
								)}
								{activeTab !== 'history' && activeTab !== 'commit' && (
									<div className="overflow-auto size-full min-h-0 flex-1">
										<div className="space-y-6 p-4 sm:p-6">
											{activeTab === 'remote' && (
												<div className="space-y-4">
													<div className="space-y-1">
														<p
															className="text-xs font-medium uppercase
																tracking-[0.18em] text-muted-foreground"
														>
															{t('git.tab.remote')}
														</p>
														<h3
															className="text-2xl font-semibold text-foreground"
														>
															{t('git.tab.remoteDesc')}
														</h3>
													</div>
													<GitTabRemote
														key={`${primaryRemote?.name ?? 'origin'}-${primaryRemote?.url ?? ''}`}
														actionBusy={actionBusy}
														canOperate={canOperate}
														initialRemoteName={primaryRemote?.name ?? 'origin'}
														initialRemoteUrl={primaryRemote?.url ?? ''}
														onPull={() => void pull()}
														onPush={() => void push()}
														onSave={(name, url) => {
															setRemoteName(name);
															void saveRemote(name, url);
														}}
													/>
												</div>
											)}
											{activeTab === 'ssh' && (
												<div className="space-y-4">
													<div className="space-y-1">
														<p
															className="text-xs font-medium uppercase
																tracking-[0.18em] text-muted-foreground"
														>
															SSH
														</p>
														<h3
															className="text-2xl font-semibold text-foreground"
														>
															{t('git.tab.authDesc')}
														</h3>
													</div>
													<GitTabSsh
														actionBusy={actionBusy}
														authPassword={authPassword}
														authUsername={authUsername}
														sshPassphrase={sshPassphrase}
														sshPrivateKeyPath={sshPrivateKeyPath}
														sshUsername={sshUsername}
														onAuthPasswordChange={setAuthPassword}
														onAuthUsernameChange={setAuthUsername}
														onPickKeyFile={() => void pickSshPrivateKeyFile()}
														onSshPassphraseChange={setSshPassphrase}
														onSshPrivateKeyPathChange={setSshPrivateKeyPath}
														onSshUsernameChange={setSshUsername}
													/>
												</div>
											)}
										</div>
									</div>
								)}
							</section>
						</div>

						<DialogFooter className="justify-between sm:justify-between">
							<div
								className="flex min-w-0 flex-1 items-center gap-2 text-xs
									leading-4 text-muted-foreground"
							>
								{busy || actionBusy ? (
									<LoaderCircle className="size-3.5 animate-spin" />
								) : (
									<GitBranch className="size-3.5" />
								)}
								<div
									className="flex min-w-0 flex-1 items-center gap-1.5
										overflow-x-hidden"
								>
									<span className="shrink truncate">{branchLabel}</span>
									<span className="shrink-0 text-muted-foreground">·</span>
									<GitSummaryIcons
										className="min-w-0 flex-1 overflow-x-hidden"
										status={status}
									/>
								</div>
							</div>
							<div
								className="shrink-0 flex flex-col-reverse gap-2 sm:flex-row
									sm:justify-end"
							>
								<Button
									disabled={!canOperate}
									onClick={() => void refreshStatus()}
									variant="outline"
								>
									<RefreshCw />
								</Button>
								<Button
									disabled={!canOperate}
									loading={actionBusy}
									onClick={() => void pull()}
									variant="outline"
								>
									<ArrowDownToLine />
									{t('git.pull')}
								</Button>
								<Button
									disabled={!canOperate}
									loading={actionBusy}
									onClick={() => void push()}
									variant="outline"
								>
									<ArrowUpFromLine />
									{t('git.push')}
								</Button>
							</div>
						</DialogFooter>
					</div>
				</DialogPopup>
			</Dialog>

			<Dialog
				open={pendingHistoryAction !== null}
				onOpenChange={(open) => !open && setPendingHistoryAction(null)}
			>
				<DialogPopup
					showCloseButton={false}
					className="max-w-[min(640px,calc(100vw-2rem))]"
				>
					<DialogHeader>
						<DialogTitle>
							{pendingHistoryAction?.type === 'undo-last'
								? t('git.undoLastCommit')
								: t('git.revertSelectedCommit')}
						</DialogTitle>
						<DialogDescription>
							{pendingHistoryAction?.type === 'undo-last'
								? t('git.undoDescription')
								: t('git.revertDescriptionWithSummary', {
										summary: pendingHistoryAction?.summary ?? '',
									})}
						</DialogDescription>
					</DialogHeader>

					<DialogFooter>
						<div className="flex w-full justify-end gap-2">
							<Button
								onClick={() => setPendingHistoryAction(null)}
								variant="outline"
							>
								{t('common.actions.cancel')}
							</Button>
							<Button
								loading={actionBusy}
								onClick={() => {
									const action = pendingHistoryAction;
									setPendingHistoryAction(null);

									if (action?.type === 'undo-last') {
										void undoLastCommit();
										return;
									}

									if (action?.type === 'revert-commit') {
										void revertHistoryCommit(action.commitId);
									}
								}}
								variant={
									pendingHistoryAction?.type === 'undo-last'
										? 'destructive-outline'
										: 'default'
								}
							>
								{pendingHistoryAction?.type === 'undo-last'
									? t('git.confirmUndo')
									: t('git.confirmRevert')}
							</Button>
						</div>
					</DialogFooter>
				</DialogPopup>
			</Dialog>
		</>
	);
}
