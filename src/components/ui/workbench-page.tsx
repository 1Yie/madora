'use client';
import { ArrowLeft } from '@phosphor-icons/react';
import {
	type ComponentType,
	type ReactNode,
	useEffect,
	useMemo,
	useRef,
} from 'react';
import { createPortal } from 'react-dom';
import { useRegisterPageOverlay } from '@/lib/page-overlay';
import { isMac } from '@/lib/platform';
import { cn } from '@/lib/utils';

export type WorkbenchItem = {
	id: string;
	label: string;
	icon: ComponentType<{ className?: string }>;
	/** Matches a `WorkbenchGroup.id`; items without one go in the first group. */
	group?: string;
};

export type WorkbenchGroup = { id: string; label?: string };

const OPEN_POPUP_SELECTOR = [
	'[data-slot="dialog-popup"]',
	'[data-slot="select-popup"]',
	'[data-slot="popover-popup"]',
	'[data-slot="menu-popup"]',
].join(',');

/**
 * Shared full-window page shell for Settings, Git and WebDAV.
 *
 * Layered over the workspace instead of routed, so editor state and unsaved
 * tabs survive opening and closing it. The window controls come from the app
 * `Titlebar`, which floats top-right while any page is open.
 *
 * - `scroll` layout: the shell owns the scroll area, the heading and the
 *   centered column; content fades out under the top drag strip.
 * - `fill` layout: the shell only supplies the column; the child manages its
 *   own scrolling (long lists with pinned headers).
 */
export function WorkbenchPage({
	open,
	onClose,
	title,
	backLabel,
	items,
	groups,
	activeId,
	onSelect,
	heading,
	layout = 'scroll',
	footer,
	children,
}: {
	open: boolean;
	onClose: () => void;
	title: string;
	backLabel: string;
	items: WorkbenchItem[];
	groups?: WorkbenchGroup[];
	activeId: string;
	onSelect: (id: string) => void;
	heading?: string;
	layout?: 'scroll' | 'fill';
	footer?: ReactNode;
	children: ReactNode;
}) {
	const scrollRef = useRef<HTMLDivElement>(null);
	useRegisterPageOverlay(open);

	useEffect(() => {
		scrollRef.current?.scrollTo(0, 0);
	}, [activeId]);

	useEffect(() => {
		if (!open) return;
		const onKeyDown = (event: KeyboardEvent) => {
			if (event.key !== 'Escape' || event.defaultPrevented) return;
			// Let an open dialog / select / menu consume Escape first.
			if (document.querySelector(OPEN_POPUP_SELECTOR)) return;
			onClose();
		};
		document.addEventListener('keydown', onKeyDown);
		return () => document.removeEventListener('keydown', onKeyDown);
	}, [open, onClose]);

	const navGroups = useMemo(() => {
		const list = groups?.length ? groups : [{ id: '' } as WorkbenchGroup];
		return list
			.map((group, index) => ({
				...group,
				items: items.filter((item) =>
					item.group ? item.group === group.id : index === 0
				),
			}))
			.filter((group) => group.items.length > 0);
	}, [groups, items]);

	if (!open) return null;

	const headingNode = heading ? (
		<h1 className="text-2xl font-semibold tracking-tight">{heading}</h1>
	) : null;

	return createPortal(
		<div
			aria-label={title}
			aria-modal="true"
			className="fixed inset-0 z-40 flex bg-background text-foreground"
			role="dialog"
		>
			<aside
				className="flex w-64 shrink-0 flex-col border-r border-sidebar-border
					bg-sidebar text-sidebar-foreground"
			>
				<div
					data-tauri-drag-region
					className="flex h-10 shrink-0 items-center px-4 text-sm font-semibold
						select-none"
				>
					{/* Clear the macOS traffic lights in the window's top-left. */}
					{isMac && <div className="w-[52px] shrink-0" />}
					<span className="pointer-events-none">{title}</span>
				</div>
				<nav className="min-h-0 flex-1 overflow-y-auto px-3 pb-4">
					<button
						type="button"
						onClick={onClose}
						className="mt-2 mb-4 flex w-full items-center gap-2.5 rounded-xl
							px-3 py-2 text-sm text-muted-foreground transition-colors
							hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
					>
						<ArrowLeft className="size-4 shrink-0" />
						{backLabel}
					</button>
					{navGroups.map((group) => (
						<div key={group.id} className="mb-4">
							{group.label ? (
								<div className="px-3 pb-1.5 text-xs text-muted-foreground">
									{group.label}
								</div>
							) : null}
							<div className="flex flex-col gap-0.5">
								{group.items.map((item) => {
									const Icon = item.icon;
									const isActive = item.id === activeId;
									return (
										<button
											key={item.id}
											type="button"
											aria-current={isActive ? 'page' : undefined}
											onClick={() => onSelect(item.id)}
											className={cn(
												`flex items-center gap-2.5 rounded-xl px-3 py-2
												text-left text-sm transition-colors`,
												isActive
													? `bg-sidebar-accent font-medium
														text-sidebar-accent-foreground`
													: `text-sidebar-foreground/80
														hover:bg-sidebar-accent/60
														hover:text-sidebar-accent-foreground`
											)}
										>
											<Icon className="size-4 shrink-0" />
											{item.label}
										</button>
									);
								})}
							</div>
						</div>
					))}
				</nav>
			</aside>

			<section className="relative flex min-w-0 flex-1 flex-col">
				<div
					data-tauri-drag-region
					className="absolute inset-x-0 top-0 z-20 h-10"
				/>
				{layout === 'scroll' ? (
					<>
						<div
							ref={scrollRef}
							key={activeId}
							className="min-h-0 flex-1 overflow-auto"
						>
							<div className="mx-auto w-full max-w-3xl space-y-6 px-8 pt-14
								pb-12">
								{headingNode}
								{children}
							</div>
						</div>
						{/* Content dissolves into the drag strip instead of being clipped */}
						<div
							aria-hidden="true"
							className="pointer-events-none absolute inset-x-0 top-0 z-10 h-14
								bg-gradient-to-b from-background from-35% via-background/70
								to-transparent"
						/>
					</>
				) : (
					<div
						className="mx-auto flex min-h-0 w-full max-w-3xl flex-1 flex-col
							overflow-hidden pt-12"
					>
						{headingNode ? (
							<div className="px-8 pb-4">{headingNode}</div>
						) : null}
						{children}
					</div>
				)}
				{footer}
			</section>
		</div>,
		document.body
	);
}

/** Bottom bar for page-level actions / status (e.g. Git branch + push). */
export function WorkbenchFooter({
	className,
	children,
}: {
	className?: string;
	children: ReactNode;
}) {
	return (
		<div
			className={cn(
				`relative z-20 flex shrink-0 items-center justify-between gap-4 border-t
				border-border bg-background px-6 py-3`,
				className
			)}
		>
			{children}
		</div>
	);
}
