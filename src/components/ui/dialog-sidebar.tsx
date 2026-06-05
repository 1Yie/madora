'use client';
import { cn } from '@/lib/utils';
import type React from 'react';

export type DialogSidebarItem = {
	id: string;
	icon: React.ComponentType<{ className?: string }>;
	label: string;
	description: string;
};

export type DialogSidebarProps = {
	className?: string;
	items: DialogSidebarItem[];
	activeId: string;
	onSelect: (id: string) => void;
};

export function DialogSidebar({
	className,
	items,
	activeId,
	onSelect,
}: DialogSidebarProps) {
	return (
		<aside
			className={cn(
				'border-b bg-muted md:w-52 md:shrink-0 md:border-b-0 md:border-r',
				className
			)}
		>
			<div
				className="size-full min-h-0 max-h-60 overflow-auto overflow-x-hidden
					md:h-full md:max-h-none"
			>
				<nav className="flex flex-col gap-0.5 px-2 py-2.5">
					{items.map((item) => {
						const Icon = item.icon;
						const isActive = activeId === item.id;
						return (
							<button
								key={item.id}
								aria-current={isActive ? 'page' : undefined}
								type="button"
								onClick={() => onSelect(item.id)}
								className={cn(
									`group relative flex items-center gap-2.5 overflow-hidden
									rounded-lg px-3 py-2 text-left transition-colors duration-100`,
									isActive
										? 'bg-primary/10 text-foreground'
										: `text-muted-foreground hover:bg-accent
											hover:text-foreground`
								)}
							>
								{isActive && (
									<span
										className="absolute left-0 top-0 bottom-0 w-0.5 bg-primary"
									/>
								)}

								<Icon
									className={cn(
										'size-4 shrink-0',
										isActive
											? 'text-primary'
											: 'text-muted-foreground group-hover:text-foreground'
									)}
								/>

								<span className="min-w-0">
									<span className="block text-sm font-medium">
										{item.label}
									</span>
									{/* <span
										className="mt-1 block text-xs leading-5
											text-muted-foreground"
									>
										{item.description}
									</span> */}
								</span>
							</button>
						);
					})}
				</nav>
			</div>
		</aside>
	);
}
