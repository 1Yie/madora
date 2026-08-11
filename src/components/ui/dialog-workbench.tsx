'use client';
import type { ReactNode } from 'react';
import { X as XIcon } from '@phosphor-icons/react';
import { Dialog, DialogClose, DialogPopup } from '@/components/ui/dialog';
import {
	DialogSidebar,
	type DialogSidebarItem,
} from '@/components/ui/dialog-sidebar';
import { startWindowDragging } from '@/invoke/window';

/**
 * Shared workbench dialog shell used by Settings, Git and WebDAV panels.
 * The title bar doubles as a drag handle: starting a drag there moves the
 * whole application window (native window dragging).
 */
export function DialogWorkbench({
	open,
	onOpenChange,
	title,
	items,
	activeId,
	onSelect,
	footer,
	children,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	title: string;
	items: DialogSidebarItem[];
	activeId: string;
	onSelect: (id: string) => void;
	footer?: ReactNode;
	children: ReactNode;
}) {
	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogPopup
				showCloseButton={false}
				className="max-h-[calc(100vh-3rem)] max-w-[calc(100vw-3rem)]
					overflow-hidden"
			>
				<div
					className="flex h-[calc(100vh-5rem)] min-h-0 min-w-0 flex-col
						overflow-hidden"
				>
					<div
						className="flex h-8 shrink-0 cursor-move touch-none select-none
							items-center gap-2 border-b border-border bg-muted/40 pl-3"
						onPointerDown={(e) => {
							if (e.button !== 0) return;
							void startWindowDragging();
						}}
					>
						<span className="text-xs font-medium text-muted-foreground">
							{title}
						</span>
						<DialogClose
							aria-label="Close"
							className="ms-auto"
							render={
								<button
									type="button"
									className="flex h-full shrink-0 items-center px-3
										text-muted-foreground transition-colors hover:bg-red-500/80
										hover:text-white"
									onPointerDown={(e) => e.stopPropagation()}
								/>
							}
						>
							<XIcon aria-hidden="true" className="size-3.5" />
						</DialogClose>
					</div>
					<div className="flex min-h-0 min-w-0 flex-1 flex-row overflow-hidden">
						<DialogSidebar
							items={items}
							activeId={activeId}
							onSelect={onSelect}
						/>
						<section
							className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden
								bg-popover"
						>
							{children}
						</section>
					</div>
					{footer}
				</div>
			</DialogPopup>
		</Dialog>
	);
}
