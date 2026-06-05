import {
	ClockIcon,
	CornerDownLeft,
	Ellipsis,
	RefreshCw,
	RotateCcw,
	UserIcon,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Menu, MenuItem, MenuPopup, MenuTrigger } from '@/components/ui/menu';
import { cn } from '@/lib/utils';

import type { GitLogEntry } from '../git-types';

type GitTabHistoryProps = {
	actionBusy: boolean;
	branchLabel: string;
	gitLog: GitLogEntry[];
	upstreamLabel: string | null;
	onRefresh: () => void;
	onRevertRequest: (commitId: string, summary: string) => void;
	onUndoRequest: () => void;
};

export function GitTabHistory({
	actionBusy,
	branchLabel,
	gitLog,
	upstreamLabel,
	onRefresh,
	onRevertRequest,
	onUndoRequest,
}: GitTabHistoryProps) {
	return (
		<>
			<div
				className="flex shrink-0 items-center justify-between gap-3 border-b
					border-border p-6 pb-4"
			>
				<div>
					<div className="text-base font-medium text-foreground">提交历史</div>
					<p className="mt-1 text-xs text-muted-foreground">
						显示当前工作区的全部提交记录。
					</p>
				</div>
				<div className="flex items-center gap-2">
					<Button
						disabled={actionBusy || gitLog.length === 0}
						onClick={onUndoRequest}
						variant="outline"
					>
						<RotateCcw />
						撤销最近提交
					</Button>
					<Button disabled={actionBusy} onClick={onRefresh} variant="outline">
						<RefreshCw />
					</Button>
				</div>
			</div>

			<div className="overflow-auto size-full min-h-0 flex-1 pr-1">
				<div className="space-y-0.5 p-3">
					{gitLog.map((entry, index) => (
						<div key={entry.id} className="git-entry flex items-stretch gap-0">
							<div
								className="relative flex w-8 shrink-0 items-stretch
									justify-center"
							>
								{index > 0 ? (
									<div className="absolute top-0 h-2 w-px bg-border" />
								) : null}
								<div
									className={cn(
										'absolute bottom-0 top-0 w-px',
										index === 0 ? 'bg-primary/30' : 'bg-border',
										index === gitLog.length - 1 && 'bottom-auto h-2.5'
									)}
								/>
								<div
									className={cn(
										`relative z-10 mt-2.5 h-2.5 w-2.5 shrink-0 rounded-full
										border-2 bg-background`,
										index === 0
											? 'border-primary ring-3 ring-primary/12'
											: 'border-primary/40'
									)}
								/>
							</div>

							<div
								className={cn(
									'min-w-0 flex-1 py-1.5 pl-1',
									index < gitLog.length - 1 && 'border-b border-border/70'
								)}
							>
								<div className="flex items-start justify-between gap-2">
									<div
										className="min-w-0 flex-1 truncate font-sans text-sm
											font-medium text-foreground"
									>
										{entry.summary}
									</div>
									<Menu>
										<MenuTrigger
											render={
												<Button
													aria-label={`提交 ${entry.id.slice(0, 7)} 的更多操作`}
													size="icon-xs"
													variant="ghost"
												/>
											}
										>
											<Ellipsis />
										</MenuTrigger>
										<MenuPopup align="end">
											<MenuItem
												disabled={actionBusy || index !== 0}
												onClick={onUndoRequest}
											>
												<RotateCcw />
												撤销最近提交
											</MenuItem>
											<MenuItem
												disabled={actionBusy}
												onClick={() => onRevertRequest(entry.id, entry.summary)}
											>
												<CornerDownLeft />
												回滚这个提交
											</MenuItem>
										</MenuPopup>
									</Menu>
								</div>

								<div
									className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1"
								>
									{index === 0 && (
										<>
											<span
												className="rounded border border-primary/30
													bg-primary/10 px-1.5 py-px text-[11px] text-primary"
											>
												HEAD
												{branchLabel !== '未初始化 Git'
													? ` · ${branchLabel}`
													: ''}
											</span>
											{upstreamLabel ? (
												<span
													className="rounded border border-primary/20
														bg-primary/6 px-1.5 py-px text-[11px]
														text-primary/80"
												>
													{upstreamLabel}
												</span>
											) : null}
										</>
									)}
									<span
										className="flex items-center gap-1 text-xs
											text-muted-foreground"
									>
										<UserIcon className="h-3 w-3" />
										{entry.authorName}
									</span>
									<span
										className="flex items-center gap-1 text-xs
											text-muted-foreground"
									>
										<ClockIcon className="h-3 w-3" />
										{entry.committedAt}
									</span>
									<span
										className="rounded border border-border bg-muted/70 px-1.5
											py-px font-mono text-[11px] text-muted-foreground"
									>
										{entry.id.slice(0, 7)}
									</span>
								</div>
							</div>
						</div>
					))}
				</div>
			</div>
		</>
	);
}
