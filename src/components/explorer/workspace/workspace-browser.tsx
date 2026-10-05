import { Folder } from '@keyline-icons/react';
import { useCallback, useRef, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import { WorkspaceProvider, useWorkspace } from '@/context/workspace-provider';
import { FileExplorerSidebar } from '@/components/explorer/file/file-explorer-sidebar';
import { Button } from '@/components/ui/button';
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from '@/components/ui/tooltip';
import { FilePreview } from '@/components/explorer/file/file-preview';
import { TabBar } from '@/components/explorer/workspace/tab-bar';
import appIcon from '@/assets/icon.png';
import { explorerSidebarStatusBarClassName } from '@/components/explorer/layout';
import { isMac } from '@/lib/platform';

const MIN_SIDEBAR_WIDTH = 240;
const MAX_SIDEBAR_WIDTH = 560;

function clampSidebarWidth(width: number): number {
	return Math.min(MAX_SIDEBAR_WIDTH, Math.max(MIN_SIDEBAR_WIDTH, width));
}

type WorkspaceBrowserProps = {
	/** Top bar of the content pane (drag region, window controls). */
	header?: ReactNode;
	/** Shown at the left of the sidebar status bar (the settings button). */
	sidebarFooter?: ReactNode;
};

export function WorkspaceBrowser(props: WorkspaceBrowserProps) {
	return (
		<WorkspaceProvider>
			<WorkspaceBrowserContent {...props} />
		</WorkspaceProvider>
	);
}

function SidebarBrand() {
	const { t } = useTranslation();
	const { openFolder, sidebarBusy } = useWorkspace();

	return (
		<div
			data-tauri-drag-region
			className="flex h-10 shrink-0 items-center gap-2 px-4 select-none"
		>
			{/* Clear the macOS traffic lights (they overlay the window top-left). */}
			{isMac && <div className="w-[52px] shrink-0" />}
			<img
				alt=""
				className="pointer-events-none size-5 rounded-md"
				draggable={false}
				src={appIcon}
			/>
			<span className="pointer-events-none text-sm font-semibold">Madora</span>
			<Tooltip>
				{/* A wrapper keeps the tooltip alive while the button is disabled. */}
				<TooltipTrigger className="ml-auto" render={<span />}>
					<Button
						aria-label={t('explorerPanel.openFolder')}
						className="text-muted-foreground hover:bg-sidebar-accent
							hover:text-sidebar-accent-foreground"
						loading={sidebarBusy}
						onClick={() => void openFolder()}
						size="icon-sm"
						variant="ghost"
					>
						<Folder className="size-4" />
					</Button>
				</TooltipTrigger>
				<TooltipContent side="bottom">
					{t('explorerPanel.openFolder')}
				</TooltipContent>
			</Tooltip>
		</div>
	);
}

function WorkspaceBrowserContent({
	header,
	sidebarFooter,
}: WorkspaceBrowserProps) {
	const { t } = useTranslation();
	const { sidebarWidth, setSidebarWidth, root, initialised } = useWorkspace();

	const dragStartWidthRef = useRef(sidebarWidth);

	const handleSidebarResizeStart = useCallback(
		(event: React.PointerEvent<HTMLDivElement>) => {
			dragStartWidthRef.current = sidebarWidth;
			const startX = event.clientX;
			const pointerId = event.pointerId;
			const target = event.currentTarget;
			target.setPointerCapture(pointerId);
			document.body.style.cursor = 'col-resize';
			document.body.style.userSelect = 'none';

			const handlePointerMove = (moveEvent: PointerEvent) => {
				setSidebarWidth(
					clampSidebarWidth(
						dragStartWidthRef.current + moveEvent.clientX - startX
					)
				);
			};

			const cleanup = () => {
				document.body.style.cursor = '';
				document.body.style.userSelect = '';
				window.removeEventListener('pointermove', handlePointerMove);
				window.removeEventListener('pointerup', handlePointerUp);
				window.removeEventListener('pointercancel', handlePointerUp);
			};

			const handlePointerUp = () => cleanup();
			window.addEventListener('pointermove', handlePointerMove);
			window.addEventListener('pointerup', handlePointerUp);
			window.addEventListener('pointercancel', handlePointerUp);
		},
		[sidebarWidth, setSidebarWidth]
	);

	return (
		<div className="flex h-full min-h-0 bg-background text-foreground">
			<div
				className="relative flex h-full min-h-0 shrink-0 flex-col bg-sidebar
					text-sidebar-foreground"
				style={{ width: `${sidebarWidth}px` }}
			>
				<SidebarBrand />
				<div className="flex min-h-0 flex-1">
					{initialised ? (
						<FileExplorerSidebar
							footerLeading={sidebarFooter}
							key={root?.path ?? 'empty'}
						/>
					) : (
						<div className="flex flex-1 flex-col justify-end">
							<div className={explorerSidebarStatusBarClassName}>
								<div className="pl-1.5">{sidebarFooter}</div>
							</div>
						</div>
					)}
				</div>
				<div
					aria-label={t('workspace.resizeSidebar')}
					className="group absolute inset-y-0 right-0 z-10 w-3 translate-x-1/2
						cursor-col-resize bg-transparent"
					onPointerDown={handleSidebarResizeStart}
					role="separator"
				>
					<div
						className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2
							bg-border transition-colors group-hover:bg-primary
							group-active:bg-primary"
					/>
				</div>
			</div>
			<main className="flex min-w-0 flex-1 flex-col overflow-hidden">
				{header}
				{initialised ? (
					<>
						<TabBar />
						<div
							className="flex min-h-0 flex-1 flex-col overflow-hidden"
							data-no-os
						>
							<FilePreview />
						</div>
					</>
				) : null}
			</main>
		</div>
	);
}
