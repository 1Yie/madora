'use client';

import { Toast } from '@base-ui/react/toast';
import {
	CircleAlertIcon,
	CircleCheckIcon,
	InfoIcon,
	LoaderCircleIcon,
	TriangleAlertIcon,
} from 'lucide-react';
import { useRef, useState } from 'react';
import type React from 'react';
import { cn } from '@/lib/utils';
import { buttonVariants } from '@/components/ui/button';

const TOAST_ICONS = {
	error: CircleAlertIcon,
	info: InfoIcon,
	loading: LoaderCircleIcon,
	success: CircleCheckIcon,
	warning: TriangleAlertIcon,
} as const;

type SwipeDirection = 'up' | 'down' | 'left' | 'right';

function getSwipeDirection(position: ToastPosition): SwipeDirection[] {
	const verticalDirection: SwipeDirection = position.startsWith('top')
		? 'up'
		: 'down';

	if (position.includes('center')) {
		return [verticalDirection];
	}

	if (position.includes('left')) {
		return ['left', verticalDirection];
	}

	return ['right', verticalDirection];
}

function upsertReplayClassName(toast: {
	type?: string;
	updateKey?: number;
}): string | undefined {
	const k = toast.updateKey ?? 0;
	if (k <= 0) return undefined;
	const isEven = k % 2 === 0;
	if (toast.type === 'error') {
		return isEven ? 'animate-toast-error-even' : 'animate-toast-error-odd';
	}
	return isEven ? 'animate-toast-success-even' : 'animate-toast-success-odd';
}

function hasToastDescription(description?: React.ReactNode): boolean {
	return (
		description !== undefined && description !== null && description !== ''
	);
}

type ErrorToastDescriptionStyle = 'default' | 'code';

type ToastData = {
	descriptionStyle?: ErrorToastDescriptionStyle;
	tooltipStyle?: boolean;
};

function ErrorToastDescription({
	description,
}: {
	description: React.ReactNode;
}): React.ReactElement {
	const containerRef = useRef<HTMLDivElement | null>(null);
	const dragStateRef = useRef<{
		pointerId: number;
		startScrollLeft: number;
		startX: number;
	} | null>(null);
	const [isDragging, setIsDragging] = useState(false);

	const stopDragging = () => {
		dragStateRef.current = null;
		setIsDragging(false);
	};

	const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
		if (event.button !== 0) {
			return;
		}

		const viewport = containerRef.current;
		if (!viewport || viewport.scrollWidth <= viewport.clientWidth) {
			return;
		}

		event.preventDefault();
		event.stopPropagation();
		dragStateRef.current = {
			pointerId: event.pointerId,
			startScrollLeft: viewport.scrollLeft,
			startX: event.clientX,
		};
		event.currentTarget.setPointerCapture(event.pointerId);
	};

	const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
		const dragState = dragStateRef.current;
		if (!dragState || dragState.pointerId !== event.pointerId) {
			return;
		}

		const viewport = containerRef.current;
		if (!viewport) {
			stopDragging();
			return;
		}

		event.preventDefault();
		event.stopPropagation();
		const deltaX = event.clientX - dragState.startX;
		if (!isDragging && Math.abs(deltaX) > 3) {
			setIsDragging(true);
		}
		viewport.scrollLeft = dragState.startScrollLeft - deltaX;
	};

	const handlePointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
		if (
			dragStateRef.current?.pointerId === event.pointerId &&
			event.currentTarget.hasPointerCapture(event.pointerId)
		) {
			event.currentTarget.releasePointerCapture(event.pointerId);
		}
		stopDragging();
	};

	return (
		<>
			<Toast.Description className="sr-only" data-slot="toast-description" />
			<div
				ref={containerRef}
				className="mt-1 max-w-full overflow-x-auto overflow-y-hidden rounded-md
					border border-border/80 bg-muted/60 overscroll-x-contain
					[scrollbar-width:thin]
					[scrollbar-color:var(--color-border)_transparent]
					[&::-webkit-scrollbar]:h-3 [&::-webkit-scrollbar-track]:bg-transparent
					[&::-webkit-scrollbar-thumb]:rounded-full
					[&::-webkit-scrollbar-thumb]:border-t-4
					[&::-webkit-scrollbar-thumb]:border-solid
					[&::-webkit-scrollbar-thumb]:border-transparent
					[&::-webkit-scrollbar-thumb]:bg-clip-padding
					[&::-webkit-scrollbar-thumb]:bg-border/80
					hover:[&::-webkit-scrollbar-thumb]:bg-border"
				onWheelCapture={(event) => event.stopPropagation()}
			>
				<div
					className={cn(
						`min-w-max whitespace-pre px-2.5 py-2 font-mono text-[11px]
						leading-5 text-foreground`,
						isDragging
							? 'cursor-grabbing select-none'
							: 'cursor-grab select-none'
					)}
					onLostPointerCapture={stopDragging}
					onPointerCancel={handlePointerUp}
					onPointerDown={handlePointerDown}
					onPointerMove={handlePointerMove}
					onPointerUp={handlePointerUp}
				>
					{description}
				</div>
			</div>
		</>
	);
}

function renderToastDescription(toast: {
	description?: React.ReactNode;
	data?: unknown;
	type?: string;
}): React.ReactNode {
	if (!hasToastDescription(toast.description)) {
		return null;
	}

	const descriptionStyle =
		(toast.data as ToastData | undefined)?.descriptionStyle ?? 'default';

	if (toast.type !== 'error' || descriptionStyle !== 'code') {
		return (
			<Toast.Description
				className="text-muted-foreground"
				data-slot="toast-description"
			/>
		);
	}

	return <ErrorToastDescription description={toast.description} />;
}

function useToastPortalContainer() {
	return document.body;
}

function Toasts({
	position,
	portalProps,
}: {
	position: ToastPosition;
	portalProps?: React.ComponentProps<typeof Toast.Portal>;
}): React.ReactElement {
	const { toasts } = Toast.useToastManager();
	const container = useToastPortalContainer();

	return (
		<Toast.Portal
			container={container}
			data-slot="toast-portal"
			{...portalProps}
		>
			<Toast.Viewport
				className={cn(
					`fixed z-60 mx-auto flex w-[calc(100%-var(--toast-inset)*2)] max-w-90
					[--toast-inset:--spacing(4)] sm:[--toast-inset:--spacing(8)]`,
					// Vertical positioning
					'data-[position*=top]:top-(--toast-inset)',
					'data-[position*=bottom]:bottom-(--toast-inset)',
					// Horizontal positioning
					'data-[position*=left]:left-(--toast-inset)',
					'data-[position*=right]:right-(--toast-inset)',
					`data-[position*=center]:left-1/2
					data-[position*=center]:-translate-x-1/2`
				)}
				data-position={position}
				data-slot="toast-viewport"
			>
				{toasts.map((toast) => {
					const Icon = toast.type
						? TOAST_ICONS[toast.type as keyof typeof TOAST_ICONS]
						: null;

					return (
						<Toast.Root
							key={toast.id}
							className={cn(
								`absolute z-[calc(9999-var(--toast-index))]
								h-(--toast-calc-height) w-full select-none rounded-lg border
								bg-[color-mix(in_srgb,var(--popover),var(--color-black)_calc(1%*max(0,var(--toast-index,0))))]
								not-dark:bg-clip-padding text-popover-foreground shadow-lg/5
								[transition:transform_.5s_cubic-bezier(.22,1,.36,1),opacity_.5s,height_.15s,background-color_.5s]
								before:pointer-events-none before:absolute before:inset-0
								before:rounded-[calc(var(--radius-lg)-1px)]
								before:shadow-[0_1px_--theme(--color-black/4%)]
								data-expanded:bg-popover
								dark:bg-[color-mix(in_srgb,var(--popover),var(--color-black)_calc(6%*max(0,var(--toast-index,0))))]
								dark:data-expanded:bg-popover
								dark:before:shadow-[0_-1px_--theme(--color-white/6%)]`,
								// Base positioning using data-position
								`data-[position*=right]:right-0
								data-[position*=right]:left-auto`,
								'data-[position*=left]:right-auto data-[position*=left]:left-0',
								'data-[position*=center]:right-0 data-[position*=center]:left-0',
								`data-[position*=top]:top-0 data-[position*=top]:bottom-auto
								data-[position*=top]:origin-[50%_calc(50%-50%*min(var(--toast-index,0),1))]`,
								`data-[position*=bottom]:top-auto
								data-[position*=bottom]:bottom-0
								data-[position*=bottom]:origin-[50%_calc(50%+50%*min(var(--toast-index,0),1))]`,
								// Gap fill for hover
								`after:absolute after:left-0
								after:h-[calc(var(--toast-gap)+1px)] after:w-full`,
								'data-[position*=top]:after:top-full',
								'data-[position*=bottom]:after:bottom-full',
								// Define some variables
								`[--toast-calc-height:var(--toast-frontmost-height,var(--toast-height))]
								[--toast-gap:--spacing(3)] [--toast-peek:--spacing(3)]
								[--toast-scale:calc(max(0,1-(var(--toast-index)*.1)))]
								[--toast-shrink:calc(1-var(--toast-scale))]`,
								// Define offset-y variable
								'data-[position*=top]:[--toast-calc-offset-y:calc(var(--toast-offset-y)+var(--toast-index)*var(--toast-gap)+var(--toast-swipe-movement-y))]',
								'data-[position*=bottom]:[--toast-calc-offset-y:calc(var(--toast-offset-y)*-1+var(--toast-index)*var(--toast-gap)*-1+var(--toast-swipe-movement-y))]',
								// Default state transform
								'data-[position*=top]:transform-[translateX(var(--toast-swipe-movement-x))_translateY(calc(var(--toast-swipe-movement-y)+(var(--toast-index)*var(--toast-peek))+(var(--toast-shrink)*var(--toast-calc-height))))_scale(var(--toast-scale))]',
								'data-[position*=bottom]:transform-[translateX(var(--toast-swipe-movement-x))_translateY(calc(var(--toast-swipe-movement-y)-(var(--toast-index)*var(--toast-peek))-(var(--toast-shrink)*var(--toast-calc-height))))_scale(var(--toast-scale))]',
								// Limited state
								'data-limited:opacity-0',
								// Expanded state
								'data-expanded:h-(--toast-height)',
								'data-position:data-expanded:transform-[translateX(var(--toast-swipe-movement-x))_translateY(var(--toast-calc-offset-y))]',
								// Starting and ending animations
								'data-[position*=top]:data-starting-style:transform-[translateY(calc(-100%-var(--toast-inset)))]',
								'data-[position*=bottom]:data-starting-style:transform-[translateY(calc(100%+var(--toast-inset)))]',
								'data-ending-style:opacity-0',
								// Ending animations (direction-aware)
								'data-ending-style:not-data-limited:not-data-swipe-direction:transform-[translateY(calc(100%+var(--toast-inset)))]',
								'data-ending-style:data-[swipe-direction=left]:transform-[translateX(calc(var(--toast-swipe-movement-x)-100%-var(--toast-inset)))_translateY(var(--toast-calc-offset-y))]',
								'data-ending-style:data-[swipe-direction=right]:transform-[translateX(calc(var(--toast-swipe-movement-x)+100%+var(--toast-inset)))_translateY(var(--toast-calc-offset-y))]',
								'data-ending-style:data-[swipe-direction=up]:transform-[translateY(calc(var(--toast-swipe-movement-y)-100%-var(--toast-inset)))]',
								'data-ending-style:data-[swipe-direction=down]:transform-[translateY(calc(var(--toast-swipe-movement-y)+100%+var(--toast-inset)))]',
								// Ending animations (expanded)
								'data-expanded:data-ending-style:data-[swipe-direction=left]:transform-[translateX(calc(var(--toast-swipe-movement-x)-100%-var(--toast-inset)))_translateY(var(--toast-calc-offset-y))]',
								'data-expanded:data-ending-style:data-[swipe-direction=right]:transform-[translateX(calc(var(--toast-swipe-movement-x)+100%+var(--toast-inset)))_translateY(var(--toast-calc-offset-y))]',
								'data-expanded:data-ending-style:data-[swipe-direction=up]:transform-[translateY(calc(var(--toast-swipe-movement-y)-100%-var(--toast-inset)))]',
								'data-expanded:data-ending-style:data-[swipe-direction=down]:transform-[translateY(calc(var(--toast-swipe-movement-y)+100%+var(--toast-inset)))]',
								upsertReplayClassName(toast)
							)}
							data-position={position}
							swipeDirection={getSwipeDirection(position)}
							toast={toast}
						>
							<Toast.Content
								className={cn(
									`pointer-events-auto flex justify-between gap-1.5
									overflow-hidden px-3.5 py-3 text-sm transition-opacity
									duration-250 data-behind:not-data-expanded:pointer-events-none
									data-behind:opacity-0 data-expanded:opacity-100`,
									toast.type === 'error' ? 'items-start' : 'items-center'
								)}
							>
								<div className="flex min-w-0 flex-1 gap-2">
									{Icon && (
										<div
											className="[&>svg]:h-lh [&>svg]:w-4
												[&_svg]:pointer-events-none [&_svg]:shrink-0"
											data-slot="toast-icon"
										>
											<Icon
												className="in-data-[type=loading]:animate-spin
													in-data-[type=error]:text-destructive
													in-data-[type=info]:text-info
													in-data-[type=success]:text-success
													in-data-[type=warning]:text-warning
													in-data-[type=loading]:opacity-80"
											/>
										</div>
									)}

									<div className="flex min-w-0 flex-1 flex-col gap-0.5">
										<Toast.Title
											className="font-medium"
											data-slot="toast-title"
										/>
										{renderToastDescription(toast)}
									</div>
								</div>
								{toast.actionProps && (
									<Toast.Action
										className={buttonVariants({ size: 'xs' })}
										data-slot="toast-action"
									>
										{toast.actionProps.children}
									</Toast.Action>
								)}
							</Toast.Content>
						</Toast.Root>
					);
				})}
			</Toast.Viewport>
		</Toast.Portal>
	);
}

function AnchoredToasts({
	portalProps,
}: {
	portalProps?: React.ComponentProps<typeof Toast.Portal>;
}): React.ReactElement {
	const { toasts } = Toast.useToastManager();

	return (
		<Toast.Portal data-slot="toast-portal-anchored" {...portalProps}>
			<Toast.Viewport
				className="outline-none"
				data-slot="toast-viewport-anchored"
			>
				{toasts.map((toast) => {
					const Icon = toast.type
						? TOAST_ICONS[toast.type as keyof typeof TOAST_ICONS]
						: null;
					const tooltipStyle =
						(toast.data as { tooltipStyle?: boolean })?.tooltipStyle ?? false;
					const positionerProps = toast.positionerProps;

					if (!positionerProps?.anchor) {
						return null;
					}

					return (
						<Toast.Positioner
							key={toast.id}
							className="z-50 max-w-[min(--spacing(64),var(--available-width))]"
							data-slot="toast-positioner"
							sideOffset={positionerProps.sideOffset ?? 4}
							toast={toast}
						>
							<Toast.Root
								className={cn(
									`relative text-balance border bg-popover
									not-dark:bg-clip-padding text-popover-foreground text-xs
									transition-[scale,opacity] before:pointer-events-none
									before:absolute before:inset-0
									before:shadow-[0_1px_--theme(--color-black/4%)]
									data-ending-style:scale-98 data-starting-style:scale-98
									data-ending-style:opacity-0 data-starting-style:opacity-0
									dark:before:shadow-[0_-1px_--theme(--color-white/6%)]`,
									tooltipStyle
										? `rounded-md shadow-md/5
											before:rounded-[calc(var(--radius-md)-1px)]`
										: `rounded-lg shadow-lg/5
											before:rounded-[calc(var(--radius-lg)-1px)]`,
									upsertReplayClassName(toast)
								)}
								data-slot="toast-popup"
								toast={toast}
							>
								{tooltipStyle ? (
									<Toast.Content className="pointer-events-auto px-2 py-1">
										<Toast.Title data-slot="toast-title" />
									</Toast.Content>
								) : (
									<Toast.Content
										className={cn(
											`pointer-events-auto flex justify-between gap-1.5
												overflow-hidden px-3.5 py-3 text-sm`,
											toast.type === 'error' ? 'items-start' : 'items-center'
										)}
									>
										<div className="flex min-w-0 flex-1 gap-2">
											{Icon && (
												<div
													className="[&>svg]:h-lh [&>svg]:w-4
														[&_svg]:pointer-events-none [&_svg]:shrink-0"
													data-slot="toast-icon"
												>
													<Icon
														className="in-data-[type=loading]:animate-spin
															in-data-[type=error]:text-destructive
															in-data-[type=info]:text-info
															in-data-[type=success]:text-success
															in-data-[type=warning]:text-warning
															in-data-[type=loading]:opacity-80"
													/>
												</div>
											)}

											<div className="flex min-w-0 flex-1 flex-col gap-0.5">
												<Toast.Title
													className="font-medium"
													data-slot="toast-title"
												/>
												{renderToastDescription(toast)}
											</div>
										</div>
										{toast.actionProps && (
											<Toast.Action
												className={buttonVariants({ size: 'xs' })}
												data-slot="toast-action"
											>
												{toast.actionProps.children}
											</Toast.Action>
										)}
									</Toast.Content>
								)}
							</Toast.Root>
						</Toast.Positioner>
					);
				})}
			</Toast.Viewport>
		</Toast.Portal>
	);
}

export const toastManager: ReturnType<typeof Toast.createToastManager> =
	Toast.createToastManager();

export const anchoredToastManager: ReturnType<typeof Toast.createToastManager> =
	Toast.createToastManager();

export function showErrorToast(
	title: React.ReactNode,
	description?: React.ReactNode,
	options?: {
		descriptionStyle?: ErrorToastDescriptionStyle;
	}
): string {
	return toastManager.add({
		data: options?.descriptionStyle
			? { descriptionStyle: options.descriptionStyle }
			: undefined,
		description,
		priority: 'high',
		title,
		type: 'error',
	});
}

export function showSuccessToast(title: React.ReactNode): string {
	return toastManager.add({
		priority: 'low',
		title,
		type: 'success',
	});
}

export type ToastPosition =
	| 'top-left'
	| 'top-center'
	| 'top-right'
	| 'bottom-left'
	| 'bottom-center'
	| 'bottom-right';

export interface ToastProviderProps extends Toast.Provider.Props {
	position?: ToastPosition;
	portalProps?: React.ComponentProps<typeof Toast.Portal>;
}

export function ToastProvider({
	children,
	position = 'bottom-right',
	portalProps,
	...props
}: ToastProviderProps): React.ReactElement {
	return (
		<Toast.Provider toastManager={toastManager} {...props}>
			{children}
			<Toasts portalProps={portalProps} position={position} />
		</Toast.Provider>
	);
}

export interface AnchoredToastProviderProps extends Toast.Provider.Props {
	portalProps?: React.ComponentProps<typeof Toast.Portal>;
}

export function AnchoredToastProvider({
	children,
	portalProps,
	...props
}: AnchoredToastProviderProps): React.ReactElement {
	return (
		<Toast.Provider toastManager={anchoredToastManager} {...props}>
			{children}
			<AnchoredToasts portalProps={portalProps} />
		</Toast.Provider>
	);
}

export { Toast as ToastPrimitive };
