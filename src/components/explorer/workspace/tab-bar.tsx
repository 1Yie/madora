import {
	type Icon,
	CaretLeft as ChevronLeft,
	CaretRight as ChevronRight,
	FileImage,
	FileMd,
	FileText,
	Crosshair as Focus,
	XSquare as SquareX,
	X,
} from '@phosphor-icons/react';
import { useLayoutEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import {
	ContextMenuPopup,
	ContextMenuRoot,
	ContextMenuTrigger,
} from '@/components/ui/context-menu';
import { Tooltip, TooltipPopup, TooltipTrigger } from '@/components/ui/tooltip';
import { MenuItem, MenuSeparator } from '@/components/ui/menu';
import type { ExplorerNode, FilePreview as FilePreviewData } from '../types';
import { useWorkspace } from '@/context/workspace-provider';
import { isSameOrDescendantPath } from '@/lib/path-utils';

export type TabEntry = {
	id: string;
	node: ExplorerNode;
	preview: FilePreviewData | null;
	previewLoading: boolean;
	previewError: string | null;
	previewRequestId: number;
	unsaved: boolean;
};

export function TabBar() {
	const { t } = useTranslation();
	const {
		root,
		tabs,
		activeTabId,
		selectTab,
		closeTabAction,
		closeTabsAction,
		reorderTabs,
		tabBarMode,
	} = useWorkspace();

	const scrollRef = useRef<HTMLDivElement>(null);
	const contentRef = useRef<HTMLDivElement>(null);
	const [showLeftShadow, setShowLeftShadow] = useState(false);
	const [showRightShadow, setShowRightShadow] = useState(false);
	const isScroll = tabBarMode === 'scroll';
	const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
	const [dragTabId, setDragTabId] = useState<string | null>(null);
	const dragSessionRef = useRef<{
		tabId: string;
		startIndex: number;
		pointerId: number;
		startX: number;
		startY: number;
		active: boolean;
	} | null>(null);
	const dragOverIndexRef = useRef<number | null>(null);
	const suppressClickRef = useRef(false);
	const ghostRef = useRef<HTMLDivElement>(null);

	// Custom drag-and-drop via pointer events: the browser's native drag
	// preview is replaced by a styled ghost that follows the cursor, and the
	// drop target is shown as an insertion line between tabs.
	const handlePointerDown = (
		e: React.PointerEvent,
		tabId: string,
		tabIndex: number
	) => {
		if (e.button !== 0) return;
		// Ignore presses on the close button (role="button" span inside)
		if ((e.target as HTMLElement).closest('[role="button"]')) return;
		(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
		dragSessionRef.current = {
			tabId,
			startIndex: tabIndex,
			pointerId: e.pointerId,
			startX: e.clientX,
			startY: e.clientY,
			active: false,
		};
	};

	const handlePointerMove = (e: React.PointerEvent) => {
		const session = dragSessionRef.current;
		if (!session || session.pointerId !== e.pointerId) return;

		if (!session.active) {
			// Wait until the cursor moves far enough before entering drag mode
			// so plain clicks (select / close) still work.
			if (
				Math.hypot(e.clientX - session.startX, e.clientY - session.startY) < 5
			) {
				return;
			}
			session.active = true;
			document.body.style.userSelect = 'none';
			setDragTabId(session.tabId);
		}

		if (ghostRef.current) {
			ghostRef.current.style.transform = `translate(${e.clientX}px, ${e.clientY}px)
				translate(-50%, -50%)`;
		}

		// Compute the insertion point from the tab under the cursor: left half
		// of a tab inserts before it, right half inserts after it.
		const hit = document
			.elementFromPoint(e.clientX, e.clientY)
			?.closest<HTMLElement>('[data-tab-drag-index]');
		let insertAt: number | null = null;
		if (hit) {
			const idx = Number(hit.dataset.tabDragIndex);
			const rect = hit.getBoundingClientRect();
			insertAt = e.clientX < rect.left + rect.width / 2 ? idx : idx + 1;
		}
		dragOverIndexRef.current = insertAt;
		setDragOverIndex((prev) => (prev === insertAt ? prev : insertAt));
	};

	const handlePointerEnd = (e: React.PointerEvent) => {
		const session = dragSessionRef.current;
		if (!session || session.pointerId !== e.pointerId) return;
		dragSessionRef.current = null;

		if (session.active) {
			suppressClickRef.current = true;
			document.body.style.userSelect = '';
			const from = session.startIndex;
			const insertAt = dragOverIndexRef.current;
			// No-op when the tab would land back at its original position
			if (insertAt !== null && insertAt !== from && insertAt !== from + 1) {
				const to = from < insertAt ? insertAt - 1 : insertAt;
				reorderTabs(from, to);
			}
		}

		setDragTabId(null);
		setDragOverIndex(null);
		dragOverIndexRef.current = null;
	};

	useLayoutEffect(() => {
		if (!isScroll) return;
		const el = scrollRef.current;
		const contentEl = contentRef.current;
		if (!el) return;

		const update = () => {
			setShowLeftShadow(el.scrollLeft > 2);
			setShowRightShadow(el.scrollLeft < el.scrollWidth - el.clientWidth - 2);
		};

		const onWheel = (e: WheelEvent) => {
			if (el.scrollWidth <= el.clientWidth) return;
			let delta = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
			if (delta === 0) return;
			if (e.deltaMode === 1) delta *= 16;
			else if (e.deltaMode === 2) delta *= el.clientWidth;
			e.preventDefault();
			el.scrollLeft += delta;
		};

		update();

		// Auto-scroll active tab into view
		const activeBtn = el.querySelector<HTMLElement>('[aria-selected="true"]');
		if (activeBtn) {
			const btnLeft = activeBtn.offsetLeft;
			const btnWidth = activeBtn.offsetWidth;
			if (btnLeft < el.scrollLeft) {
				el.scrollLeft = Math.max(0, btnLeft - 8);
			} else if (btnLeft + btnWidth > el.scrollLeft + el.clientWidth) {
				el.scrollLeft = btnLeft + btnWidth - el.clientWidth + 8;
			}
		}

		el.addEventListener('scroll', update);
		el.addEventListener('wheel', onWheel, { passive: false });

		const elObs = new ResizeObserver(update);
		elObs.observe(el);
		const contentObs = contentEl ? new ResizeObserver(update) : null;
		contentObs?.observe(contentEl ?? el);

		return () => {
			el.removeEventListener('scroll', update);
			el.removeEventListener('wheel', onWheel);
			elObs.disconnect();
			contentObs?.disconnect();
		};
	}, [tabs, activeTabId, isScroll]);

	if (tabs.length === 0) return null;
	const draggedTab = dragTabId
		? tabs.find((tab) => tab.id === dragTabId)
		: null;

	return (
		<div className={isScroll ? 'relative' : ''}>
			<div
				ref={isScroll ? scrollRef : undefined}
				style={isScroll ? { overflowX: 'auto' } : undefined}
				data-no-os
				className={
					isScroll
						? `h-8 shrink-0 border-b border-border bg-muted/30
							[scrollbar-width:none] [-ms-overflow-style:none]
							[&::-webkit-scrollbar]:hidden`
						: 'shrink-0 overflow-hidden border-b border-border bg-muted/30'
				}
				role="tablist"
			>
				<div
					ref={isScroll ? contentRef : undefined}
					className={
						isScroll
							? 'flex flex-row h-full w-max items-stretch'
							: 'flex flex-row flex-wrap items-end -mb-px'
					}
				>
					{tabs.map((tab) => {
						const isActive = tab.id === activeTabId;
						const Icon: Icon =
							tab.node.fileKind === 'image'
								? FileImage
								: tab.node.fileKind === 'markdown'
									? FileMd
									: FileText;
						const fileName =
							tab.node.name ||
							(tab.node.path.replace(/\\/g, '/').split('/').pop() ?? '');
						const tabIndex = tabs.indexOf(tab);
						const leftTabIds = tabs.slice(0, tabIndex).map((t) => t.id);
						const rightTabIds = tabs.slice(tabIndex + 1).map((t) => t.id);
						const otherTabIds = tabs
							.filter((t) => t.id !== tab.id)
							.map((t) => t.id);
						const allTabIds = tabs.map((t) => t.id);
						const insertBefore = dragOverIndex === tabIndex;
						const insertAfter =
							dragOverIndex === tabs.length && tabIndex === tabs.length - 1;

						return (
							<ContextMenuRoot key={tab.id}>
								<ContextMenuTrigger>
									<Tooltip>
										<TooltipTrigger
											render={
												<button
													onPointerDown={(e) =>
														handlePointerDown(e, tab.id, tabIndex)
													}
													onPointerMove={handlePointerMove}
													onPointerUp={handlePointerEnd}
													onPointerCancel={handlePointerEnd}
													data-tab-drag-index={tabIndex}
													className={cn(
														`group relative flex h-8 shrink-0 cursor-pointer
														items-center gap-1.5 select-none`,
														'border-r border-border pl-4 pr-1 text-xs',
														!isScroll && 'border-b border-border',
														'transition-colors duration-100',
														'hover:bg-muted/50',
														`focus-visible:outline-none
														focus-visible:bg-muted/50`,
														insertBefore &&
															'border-l-2 border-l-primary border-r-0',
														insertAfter && 'border-r-2 border-r-primary',
														dragTabId === tab.id && 'opacity-40',
														isActive
															? 'bg-background text-foreground'
															: 'text-muted-foreground hover:text-foreground',
														tab.node.isMissing &&
															`text-muted-foreground/60
															hover:text-muted-foreground/80`
													)}
													onClick={() => {
														if (suppressClickRef.current) {
															suppressClickRef.current = false;
															return;
														}
														selectTab(tab.id);
													}}
													onMouseDown={(e) => {
														if (e.button === 1) {
															e.preventDefault();
															closeTabAction(tab.id);
														}
													}}
													role="tab"
													aria-selected={isActive}
													type="button"
												/>
											}
										>
											{isActive && (
												<div
													className={cn(
														'absolute inset-x-0 top-0 h-0.5',
														tab.node.isMissing
															? 'bg-muted-foreground/40'
															: 'bg-primary'
													)}
													aria-hidden="true"
												/>
											)}
											<Icon
												className={cn(
													'size-3.5 shrink-0',
													tab.node.isMissing && 'opacity-50'
												)}
											/>
											<span
												className={cn(
													'max-w-32 truncate leading-4 pb-px',
													tab.node.isMissing && 'line-through'
												)}
											>
												{root &&
												!isSameOrDescendantPath(tab.node.path, root.path) &&
												!tab.node.isMissing
													? `⟨${fileName}⟩`
													: fileName}
											</span>
											<span
												className={cn(
													`ml-0.5 flex size-4 shrink-0 items-center
													justify-center rounded-sm`,
													'transition-colors',
													'hover:bg-muted-foreground/20',
													'focus-visible:outline-none'
												)}
												onClick={(e) => {
													e.stopPropagation();
													e.preventDefault();
													closeTabAction(tab.id);
												}}
												onKeyDown={(e) => {
													if (e.key === 'Enter' || e.key === ' ') {
														e.stopPropagation();
														closeTabAction(tab.id);
													}
												}}
												role="button"
												tabIndex={-1}
												aria-label={t('tabBar.closeTabWithName', {
													name: fileName,
												})}
											>
												{tab.unsaved ? (
													<>
														<span className="group-hover:hidden">
															<span
																className="block size-2 rounded-full
																	bg-muted-foreground"
															/>
														</span>
														<span className="hidden group-hover:block">
															<X className="size-3" />
														</span>
													</>
												) : (
													<X className="size-3" />
												)}
											</span>
										</TooltipTrigger>
										<TooltipPopup side="bottom" sideOffset={0}>
											{tab.node.path}
											{root &&
												!isSameOrDescendantPath(tab.node.path, root.path) &&
												` - ${t('tabBar.outsideWorkspace')}`}
										</TooltipPopup>
									</Tooltip>
								</ContextMenuTrigger>
								<ContextMenuPopup align="start" sideOffset={4}>
									<MenuItem onClick={() => closeTabAction(tab.id)}>
										<X className="size-3.5" />
										{t('tabBar.closeCurrent')}
									</MenuItem>
									<MenuSeparator />
									<MenuItem
										onClick={() => closeTabsAction(leftTabIds)}
										disabled={leftTabIds.length === 0}
									>
										<ChevronLeft className="size-3.5" />
										{t('tabBar.closeLeft')}
									</MenuItem>
									<MenuItem
										onClick={() => closeTabsAction(rightTabIds)}
										disabled={rightTabIds.length === 0}
									>
										<ChevronRight className="size-3.5" />
										{t('tabBar.closeRight')}
									</MenuItem>
									<MenuSeparator />
									<MenuItem
										onClick={() => closeTabsAction(otherTabIds)}
										disabled={otherTabIds.length === 0}
									>
										<Focus className="size-3.5" />
										{t('tabBar.keepCurrentOnly')}
									</MenuItem>
									<MenuItem onClick={() => closeTabsAction(allTabIds)}>
										<SquareX className="size-3.5" />
										{t('tabBar.closeAll')}
									</MenuItem>
								</ContextMenuPopup>
							</ContextMenuRoot>
						);
					})}
				</div>
			</div>

			{isScroll && (
				<>
					<div
						className="pointer-events-none absolute left-0 top-0 bottom-0 w-6
							bg-linear-to-r from-black/8 to-transparent transition-opacity
							duration-150"
						style={{ opacity: showLeftShadow ? 1 : 0 }}
					/>
					<div
						className="pointer-events-none absolute right-0 top-0 bottom-0 w-6
							bg-linear-to-l from-black/8 to-transparent transition-opacity
							duration-150"
						style={{ opacity: showRightShadow ? 1 : 0 }}
					/>
				</>
			)}

			{dragTabId && draggedTab && (
				<div
					ref={ghostRef}
					className="pointer-events-none fixed left-0 top-0 z-50 flex h-8
						items-center gap-1.5 rounded-md border border-border bg-background
						pl-3 pr-2 text-xs text-foreground shadow-lg"
					style={{ transform: 'translate(-9999px, -9999px)' }}
				>
					{draggedTab.node.fileKind === 'image' ? (
						<FileImage className="size-3.5 shrink-0" />
					) : (
						<FileText className="size-3.5 shrink-0" />
					)}
					<span className="max-w-32 truncate">
						{draggedTab.node.name ||
							draggedTab.node.path.replace(/\\/g, '/').split('/').pop()}
					</span>
				</div>
			)}
		</div>
	);
}
