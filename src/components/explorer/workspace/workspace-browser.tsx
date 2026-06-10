import { useCallback, useRef } from 'react';

import { WorkspaceProvider, useWorkspace } from '@/context/workspace-provider';
import { FileExplorerSidebar } from '@/components/explorer/file/file-explorer-sidebar';
import { FilePreview } from '@/components/explorer/file/file-preview';
import { TabBar } from '@/components/explorer/workspace/tab-bar';

const MIN_SIDEBAR_WIDTH = 240;
const MAX_SIDEBAR_WIDTH = 560;

function clampSidebarWidth(width: number): number {
	return Math.min(MAX_SIDEBAR_WIDTH, Math.max(MIN_SIDEBAR_WIDTH, width));
}

export function WorkspaceBrowser() {
	return (
		<WorkspaceProvider>
			<WorkspaceBrowserContent />
		</WorkspaceProvider>
	);
}

function WorkspaceBrowserContent() {
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

	if (!initialised) {
		return (
			<div className="flex h-full min-h-0 bg-background text-foreground">
				<div
					className="relative flex h-full min-h-0 shrink-0"
					style={{ width: `${sidebarWidth}px` }}
				>
					<div className="flex-1" />
				</div>
				<main className="flex min-w-0 flex-1 flex-col overflow-hidden" />
			</div>
		);
	}

	return (
		<div className="flex h-full min-h-0 bg-background text-foreground">
			<div
				className="relative flex h-full min-h-0 shrink-0"
				style={{ width: `${sidebarWidth}px` }}
			>
				<FileExplorerSidebar key={root?.path ?? 'empty'} />
				<div
					aria-label="调整侧边栏宽度"
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
				<TabBar />
				<div
					className="flex min-h-0 flex-1 flex-col overflow-hidden"
					data-no-os
				>
					<FilePreview />
				</div>
			</main>
		</div>
	);
}
