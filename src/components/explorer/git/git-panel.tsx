import { invoke } from '@tauri-apps/api/core';
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
} from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
	NativeDialog,
	NativeDialogClose,
	NativeDialogDescription,
	NativeDialogFooter,
	NativeDialogHeader,
	NativeDialogTitle,
} from '@/components/ui/native-dialog';
import { Popover, PopoverPopup, PopoverTrigger } from '@/components/ui/popover';
import { showErrorToast, showSuccessToast } from '@/components/ui/toast';
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
	GitSyncResult,
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

const workbenchSections = [
	{
		id: 'commit' as GitWorkbenchTab,
		label: '提交',
		description: '创建新提交',
		icon: Check,
	},
	{
		id: 'history' as GitWorkbenchTab,
		label: '历史',
		description: '提交记录',
		icon: History,
	},
	{
		id: 'remote' as GitWorkbenchTab,
		label: '远端',
		description: '远端同步配置',
		icon: Settings2,
	},
	{
		id: 'ssh' as GitWorkbenchTab,
		label: 'SSH',
		description: '认证凭据设置',
		icon: KeyRound,
	},
];

function getBranchLabel(status: GitStatus | null): string {
	if (!status?.branch?.name) {
		return '未初始化 Git';
	}

	return status.branch.name;
}

function getSummary(status: GitStatus | null): string {
	if (!status) {
		return '正在读取仓库状态';
	}

	if (!status.hasRepository) {
		return '当前工作区还不是 Git 仓库';
	}

	if (status.conflictedFiles.length > 0) {
		switch (status.repositoryState) {
			case 'revert':
				return `正在回滚，${status.conflictedFiles.length} 个冲突待解决`;
			case 'merge':
				return `正在合并，${status.conflictedFiles.length} 个冲突待解决`;
			case 'cherryPick':
				return `正在拣选，${status.conflictedFiles.length} 个冲突待解决`;
			case 'rebase':
				return `正在变基，${status.conflictedFiles.length} 个冲突待解决`;
			default:
				return `${status.conflictedFiles.length} 个冲突待解决`;
		}
	}

	const parts: string[] = [];

	if (status.branch?.ahead) {
		parts.push(`领先 ${status.branch.ahead}`);
	}

	if (status.branch?.behind) {
		parts.push(`落后 ${status.branch.behind}`);
	}

	if (status.totalChangedCount === 0) {
		return parts.length > 0
			? `工作区干净 · ${parts.join(' · ')}`
			: '工作区干净';
	}

	const changeInfo = `${status.stagedCount} 已暂存 / ${status.unstagedCount} 未暂存`;
	return parts.length > 0 ? `${changeInfo} · ${parts.join(' · ')}` : changeInfo;
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
			void invoke('git_store_credentials', { credentials: creds });
		}, CREDENTIALS_DEBOUNCE_MS);
	}, []);

	useEffect(() => {
		void (async () => {
			try {
				const creds = await invoke<GitCredentials>('git_load_credentials');
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
				'Git 操作失败',
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
			const entries = await invoke<GitLogEntry[]>('git_log', {
				limit: null,
				rootPath,
			});
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
			const list = await invoke<GitBranchInfo[]>('git_list_branches', {
				rootPath,
			});
			setBranches(list);
		} catch (error) {
			showErrorToast(
				'获取分支列表失败',
				error instanceof Error ? error.message : String(error)
			);
		} finally {
			setBranchesLoaded(true);
		}
	};

	const switchBranch = async (branchName: string) => {
		if (!rootPath) return;

		const nextStatus = await runAction(
			() => invoke<GitStatus>('git_switch_branch', { rootPath, branchName }),
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
			await invoke<GitStatus>('git_create_branch', {
				rootPath,
				branchName: newBranchName.trim(),
			});
			setNewBranchName('');
			setBranchPopoverOpen(false);
			await refreshStatus();
		} catch (error) {
			showErrorToast(
				'创建分支失败',
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
			() => invoke<GitStatus>('git_init', { rootPath }),
			'已初始化 Git 仓库'
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
			showErrorToast('远端保存失败', '请填写远端名称和仓库地址');
			return;
		}

		const nextStatus = await runAction(
			() =>
				invoke<GitStatus>('git_set_remote', {
					remoteName: trimmedName,
					remoteUrl: trimmedUrl,
					rootPath,
				}),
			'远端已保存'
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
			showErrorToast('提交失败', '请输入提交说明');
			return;
		}

		const result = await runAction(
			() =>
				invoke<GitSyncResult>('git_commit', {
					authorEmail: null,
					authorName: null,
					message: trimmedMessage,
					rootPath,
				}),
			'提交成功'
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
			showErrorToast('提交失败', '请输入提交说明');
			return;
		}

		const result = await runAction(
			() =>
				invoke<GitSyncResult>('git_commit_all', {
					authorEmail: null,
					authorName: null,
					message: trimmedMessage,
					rootPath,
				}),
			'提交成功'
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
			invoke<GitStatus>('git_stage_file', { path: filePath, rootPath })
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
			invoke<GitStatus>('git_unstage_file', { path: filePath, rootPath })
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
				invoke<GitSyncResult>('git_push', {
					auth: buildAuth(),
					branchName: status?.branch?.name ?? null,
					remoteName: remoteName.trim() || primaryRemote?.name || 'origin',
					rootPath,
				}),
			'推送成功'
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
				invoke<GitSyncResult>('git_pull', {
					auth: buildAuth(),
					authorEmail: null,
					authorName: null,
					branchName: status?.branch?.name ?? null,
					remoteName: remoteName.trim() || primaryRemote?.name || 'origin',
					rootPath,
				}),
			'拉取完成'
		);

		if (result) {
			if (result.conflicts.length > 0) {
				showErrorToast('存在合并冲突', result.conflicts.join('\n'));
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
				invoke<GitStatus>('git_fetch', {
					auth: buildAuth(),
					remoteName: remoteName.trim() || primaryRemote?.name || 'origin',
					rootPath,
				}),
			'已获取远端更新'
		);

		if (result) {
			onStatusChange(result);
			await loadGitLog();
		}
	};

	const pickSshPrivateKeyFile = async () => {
		setActionBusy(true);

		try {
			const selectedPath = await invoke<string | null>(
				'git_pick_ssh_private_key_file'
			);

			if (selectedPath) {
				setSshPrivateKeyPath(selectedPath);
				showSuccessToast('已选择 SSH 私钥文件');
			}
		} catch (error) {
			showErrorToast(
				'选择文件失败',
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
			() => invoke<GitSyncResult>('git_undo_last_commit', { rootPath }),
			'已撤销最近提交'
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
				invoke<GitSyncResult>('git_revert_commit', {
					authorEmail: null,
					authorName: null,
					commitId,
					rootPath,
				}),
			'已生成回滚提交'
		);

		if (result) {
			if (result.conflicts.length > 0) {
				showErrorToast('回滚提交出现冲突', result.conflicts.join('\n'));
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

	const branchLabel = getBranchLabel(status);
	const summary = getSummary(status);
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
									overflow-hidden rounded-md px-2 py-1 text-left leading-none
									text-muted-foreground outline-none hover:bg-sidebar-accent/60"
								render={
									<PopoverTrigger
										aria-label={statusTooltip}
										className="flex min-w-0 flex-1 items-center gap-2
											overflow-hidden rounded-md px-2 py-1 text-left
											leading-none text-muted-foreground outline-none
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
								{statusTooltip}
							</TooltipContent>
						</Tooltip>
						<PopoverPopup className="p-0 m-0">
							<div className="flex max-h-80 flex-col gap-2">
								<ScrollArea className="min-h-0 flex-1">
									{branches.length === 0 ? (
										<p
											className="px-3 py-4 text-center text-xs
												text-muted-foreground"
										>
											{branchesLoaded ? '暂无分支' : '加载中...'}
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
														当前
													</span>
												) : null}
											</Button>
										))
									)}
								</ScrollArea>
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
								rounded-md px-2 py-1 text-left leading-none
								text-muted-foreground outline-none"
							render={
								<button
									aria-label={statusTooltip}
									className="flex min-w-0 flex-1 items-center gap-2
										overflow-hidden rounded-md px-2 py-1 text-left leading-none
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
							{statusTooltip}
						</TooltipContent>
					</Tooltip>
				)}
				<div
					className="flex shrink-0 items-center gap-1.5 text-muted-foreground"
				>
					{!status?.hasRepository ? (
						<Button
							disabled={!canOperate}
							onClick={() => void initRepository()}
							size="xs"
							variant="outline"
						>
							<Plus />
							初始化
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

			<NativeDialog
				className="max-h-[min(88vh,840px)] max-w-[min(980px,calc(100vw-2rem))]"
				onOpenChange={setWorkbenchOpen}
				open={workbenchOpen}
			>
				<div
					className="flex h-[min(88vh,720px)] min-h-0 min-w-0 flex-col
						overflow-hidden"
				>
					<NativeDialogClose
						className="absolute inset-e-2 top-2 z-10"
						onClick={() => setWorkbenchOpen(false)}
					/>
					<div className="flex min-h-0 min-w-0 flex-1 flex-row overflow-hidden">
						<aside
							className="border-r border-border bg-muted md:w-56 md:shrink-0"
						>
							<ScrollArea
								className="max-h-60 md:h-full md:max-h-none overflow-x-hidden"
							>
								<nav className="flex flex-col gap-1 p-3">
									{workbenchSections.map((section) => {
										const Icon = section.icon;
										const isActive = activeTab === section.id;

										return (
											<button
												key={section.id}
												aria-current={isActive ? 'page' : undefined}
												type="button"
												className={cn(
													`flex items-start gap-3 rounded-xl px-3 py-3 text-left
													transition-colors`,
													isActive
														? 'bg-primary/10 text-foreground'
														: `text-muted-foreground hover:bg-accent
															hover:text-foreground`
												)}
												onClick={() => {
													if (section.id === 'history') {
														void loadGitLog();
													}
													setActiveTab(section.id);
												}}
											>
												<span
													className={cn(
														'mt-0.5 rounded-lg border p-2',
														isActive
															? 'border-primary/30 bg-primary/10 text-primary'
															: `border-border bg-background
																text-muted-foreground`
													)}
												>
													<Icon className="size-4" />
												</span>
												<span className="min-w-0">
													<span className="block text-sm font-medium">
														{section.label}
													</span>
													<span
														className="mt-1 block text-xs leading-5
															text-muted-foreground"
													>
														{section.description}
													</span>
												</span>
											</button>
										);
									})}
								</nav>
							</ScrollArea>
						</aside>
						<section
							className="flex min-h-0 min-w-0 flex-1 pt-4 flex-col
								overflow-hidden bg-popover"
						>
							{activeTab === 'history' && (
								<GitTabHistory
									actionBusy={actionBusy}
									branchLabel={branchLabel}
									gitLog={gitLog}
									upstreamLabel={upstreamLabel}
									onRefresh={() => void loadGitLog()}
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
							)}
							{activeTab === 'commit' && (
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
							)}
							{activeTab !== 'history' && activeTab !== 'commit' && (
								<ScrollArea className="min-h-0 flex-1">
									<div className="space-y-6 p-4 sm:p-6">
										{activeTab === 'remote' && (
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
										)}
										{activeTab === 'ssh' && (
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
										)}
									</div>
								</ScrollArea>
							)}
						</section>
					</div>

					<NativeDialogFooter className="justify-between sm:justify-between">
						<div
							className="flex min-w-0 flex-1 items-center gap-2 text-xs
								text-muted-foreground"
						>
							{busy || actionBusy ? (
								<LoaderCircle className="size-3.5 animate-spin" />
							) : (
								<GitBranch className="size-3.5" />
							)}
							<span className="min-w-0 truncate">{statusTooltip}</span>
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
								拉取
							</Button>
							<Button
								disabled={!canOperate}
								loading={actionBusy}
								onClick={() => void push()}
								variant="outline"
							>
								<ArrowUpFromLine />
								推送
							</Button>
						</div>
					</NativeDialogFooter>
				</div>
			</NativeDialog>

			<NativeDialog
				open={pendingHistoryAction !== null}
				onOpenChange={(open) => !open && setPendingHistoryAction(null)}
				className="max-w-[min(640px,calc(100vw-2rem))]"
			>
				<div className="flex h-auto min-h-0 min-w-0 flex-col overflow-hidden">
					<NativeDialogHeader>
						<NativeDialogTitle>
							{pendingHistoryAction?.type === 'undo-last'
								? '撤销最近提交'
								: '回滚指定提交'}
						</NativeDialogTitle>
						<NativeDialogDescription>
							{pendingHistoryAction?.type === 'undo-last'
								? '会把最近一次提交从历史中移除，但保留改动到工作区。该操作只建议在还未推送时使用。'
								: `会创建一个新的回滚提交，用来撤销这次提交的效果：${pendingHistoryAction?.summary ?? ''}`}
						</NativeDialogDescription>
					</NativeDialogHeader>

					<NativeDialogFooter>
						<div className="flex w-full justify-end gap-2">
							<Button
								onClick={() => setPendingHistoryAction(null)}
								variant="outline"
							>
								取消
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
									? '确认撤销'
									: '确认回滚'}
							</Button>
						</div>
					</NativeDialogFooter>
				</div>
			</NativeDialog>
		</>
	);
}
