import {
	type LucideIcon,
	ChevronLeft,
	ChevronRight,
	FileImage,
	FileText,
	Focus,
	SquareX,
	X,
} from 'lucide-react';
import { useLayoutEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import {
	ContextMenuPopup,
	ContextMenuRoot,
	ContextMenuTrigger,
} from '@/components/ui/context-menu';
import { MenuItem, MenuSeparator } from '@/components/ui/menu';
import type { ExplorerNode, FilePreview as FilePreviewData } from '../types';

export type TabEntry = {
	id: string;
	node: ExplorerNode;
	preview: FilePreviewData | null;
	previewLoading: boolean;
	previewError: string | null;
	previewRequestId: number;
	unsaved: boolean;
};

type TabBarProps = {
	tabs: TabEntry[];
	activeTabId: string | null;
	onSelectTab: (tabId: string) => void;
	onCloseTab: (tabId: string) => void;
	onCloseTabs: (tabIds: string[]) => void;
	tabBarMode: 'scroll' | 'wrap';
};
export function TabBar({
	tabs,
	activeTabId,
	onSelectTab,
	onCloseTab,
	onCloseTabs,
	tabBarMode,
}: TabBarProps) {
	const scrollRef = useRef<HTMLDivElement>(null);
	const contentRef = useRef<HTMLDivElement>(null);
	const [showLeftShadow, setShowLeftShadow] = useState(false);
	const [showRightShadow, setShowRightShadow] = useState(false);
	const isScroll = tabBarMode === 'scroll';

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
						const Icon: LucideIcon =
							tab.node.fileKind === 'image' ? FileImage : FileText;
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

						return (
							<ContextMenuRoot key={tab.id}>
								<ContextMenuTrigger>
									<button
										className={cn(
											`group relative flex h-8 shrink-0 cursor-pointer
											items-center gap-1.5`,
											'border-r border-border pl-4 pr-1 text-xs',
											!isScroll && 'border-b border-border',
											'transition-colors duration-100',
											'hover:bg-muted/50',
											'focus-visible:outline-none focus-visible:bg-muted/50',
											isActive
												? 'bg-background text-foreground'
												: 'text-muted-foreground hover:text-foreground',
											tab.node.isMissing &&
												`text-muted-foreground/60
												hover:text-muted-foreground/80`
										)}
										onClick={() => onSelectTab(tab.id)}
										onMouseDown={(e) => {
											if (e.button === 1) {
												e.preventDefault();
												onCloseTab(tab.id);
											}
										}}
										role="tab"
										aria-selected={isActive}
										type="button"
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
											{fileName}
										</span>
										<span
											className={cn(
												`ml-0.5 flex size-4 shrink-0 items-center justify-center
												rounded-sm`,
												'transition-colors',
												'hover:bg-muted-foreground/20',
												'focus-visible:outline-none'
											)}
											onClick={(e) => {
												e.stopPropagation();
												e.preventDefault();
												onCloseTab(tab.id);
											}}
											onKeyDown={(e) => {
												if (e.key === 'Enter' || e.key === ' ') {
													e.stopPropagation();
													onCloseTab(tab.id);
												}
											}}
											role="button"
											tabIndex={-1}
											aria-label={`关闭 ${fileName}`}
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
									</button>
								</ContextMenuTrigger>
								<ContextMenuPopup align="start" sideOffset={4}>
									<MenuItem onClick={() => onCloseTab(tab.id)}>
										<X className="size-3.5" />
										关闭当前标签页
									</MenuItem>
									<MenuSeparator />
									<MenuItem
										onClick={() => onCloseTabs(leftTabIds)}
										disabled={leftTabIds.length === 0}
									>
										<ChevronLeft className="size-3.5" />
										关闭左侧标签页
									</MenuItem>
									<MenuItem
										onClick={() => onCloseTabs(rightTabIds)}
										disabled={rightTabIds.length === 0}
									>
										<ChevronRight className="size-3.5" />
										关闭右侧标签页
									</MenuItem>
									<MenuSeparator />
									<MenuItem
										onClick={() => onCloseTabs(otherTabIds)}
										disabled={otherTabIds.length === 0}
									>
										<Focus className="size-3.5" />
										仅保留当前标签页
									</MenuItem>
									<MenuItem onClick={() => onCloseTabs(allTabIds)}>
										<SquareX className="size-3.5" />
										关闭所有标签页
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
							bg-gradient-to-r from-black/8 to-transparent transition-opacity
							duration-150"
						style={{ opacity: showLeftShadow ? 1 : 0 }}
					/>
					<div
						className="pointer-events-none absolute right-0 top-0 bottom-0 w-6
							bg-gradient-to-l from-black/8 to-transparent transition-opacity
							duration-150"
						style={{ opacity: showRightShadow ? 1 : 0 }}
					/>
				</>
			)}
		</div>
	);
}
