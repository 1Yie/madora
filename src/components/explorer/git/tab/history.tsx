import { useTranslation } from 'react-i18next';
import {
	Clock as ClockIcon,
	CornerDownLeft,
	MoreHorizontal as Ellipsis,
	RotateCcw,
	User as UserIcon,
} from '@keyline-icons/react';

import { Button } from '@/components/ui/button';
import { Menu, MenuItem, MenuPopup, MenuTrigger } from '@/components/ui/menu';
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from '@/components/ui/tooltip';
import { SettingsSectionCard } from '@/components/system/setting/shared';
import { cn } from '@/lib/utils';

import type { GitLogEntry } from '../git-types';

type GitTabHistoryProps = {
	actionBusy: boolean;
	branchLabel: string;
	gitLog: GitLogEntry[];
	upstreamLabel: string | null;
	onRevertRequest: (commitId: string, summary: string) => void;
	onUndoRequest: () => void;
};

export function GitTabHistory({
	actionBusy,
	branchLabel,
	gitLog,
	upstreamLabel,
	onRevertRequest,
	onUndoRequest,
}: GitTabHistoryProps) {
	const { t } = useTranslation();

	const notInitializedLabel = t('git.status.notInitialized');

	return (
		<>
			<div className="shrink-0 px-8 pb-4">
				<SettingsSectionCard>
					<div className="flex items-center gap-2">
						<Button
							disabled={actionBusy || gitLog.length === 0}
							onClick={onUndoRequest}
							variant="outline"
						>
							<RotateCcw />
							{t('git.undoLastCommit')}
						</Button>
					</div>
				</SettingsSectionCard>
			</div>

			<div className="h-full min-h-0 flex-1 overflow-auto">
				<div className="space-y-0.5 px-8 pb-8">
					{gitLog.map((entry, index) => {
						const shortCommitId = entry.id.slice(0, 7);
						const isHead = index === 0;
						const isLast = index === gitLog.length - 1;

						return (
							<div
								key={entry.id}
								className="git-entry flex items-stretch gap-0"
							>
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
											isHead ? 'bg-primary/30' : 'bg-border',
											isLast && 'bottom-auto h-2.5'
										)}
									/>

									<div
										className={cn(
											`relative z-10 mt-2.5 h-2.5 w-2.5 shrink-0 rounded-full
											border-2 bg-background`,
											isHead
												? 'border-primary ring-3 ring-primary/12'
												: 'border-primary/40'
										)}
									/>
								</div>

								<div
									className={cn(
										'min-w-0 flex-1 py-1.5 pl-1',
										!isLast && 'border-b border-border/70'
									)}
								>
									<div className="flex items-start justify-between gap-2">
										<Tooltip>
											<TooltipTrigger
												render={
													<div
														className="min-w-0 flex-1 truncate font-sans text-sm
															font-medium text-foreground"
													/>
												}
											>
												{entry.summary}
											</TooltipTrigger>
											<TooltipContent>{entry.summary}</TooltipContent>
										</Tooltip>

										<Menu>
											<Tooltip>
												<TooltipTrigger
													render={
														<MenuTrigger
															render={
																<Button
																	aria-label={`${t('git.moreActions')} ${shortCommitId}`}
																	size="icon-xs"
																	variant="ghost"
																/>
															}
														/>
													}
												>
													<Ellipsis />
												</TooltipTrigger>
												<TooltipContent>{t('git.moreActions')}</TooltipContent>
											</Tooltip>

											<MenuPopup align="end">
												<MenuItem
													disabled={actionBusy || !isHead}
													onClick={onUndoRequest}
												>
													<RotateCcw />
													{t('git.undoLastCommit')}
												</MenuItem>

												<MenuItem
													disabled={actionBusy}
													onClick={() =>
														onRevertRequest(entry.id, entry.summary)
													}
												>
													<CornerDownLeft />
													{t('git.revertThisCommit')}
												</MenuItem>
											</MenuPopup>
										</Menu>
									</div>

									<div
										className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1"
									>
										{isHead ? (
											<>
												<span
													className="rounded border border-primary/30
														bg-primary/10 px-1.5 py-px text-[11px] text-primary"
												>
													HEAD
													{branchLabel !== notInitializedLabel
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
										) : null}

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
											{shortCommitId}
										</span>
									</div>
								</div>
							</div>
						);
					})}
				</div>
			</div>
		</>
	);
}
