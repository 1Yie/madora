'use client';

import { cn } from '@/lib/utils';
import { ScrollArea } from '@/components/ui/scroll-area';
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
				'border-b bg-muted md:w-64 md:shrink-0 md:border-b-0 md:border-r',
				className
			)}
		>
			<ScrollArea className="max-h-60 md:h-full md:max-h-none overflow-x-hidden">
				<nav className="flex flex-col gap-1 p-3">
					{items.map((section) => {
						const Icon = section.icon;
						const isActive = activeId === section.id;

						return (
							<button
								key={section.id}
								aria-current={isActive ? 'page' : undefined}
								type="button"
								className={cn(
									`flex items-start gap-3 rounded-xl px-3 py-3 text-left
									transition-colors`,
									isActive
										? 'bg-primary/10 text-foreground'
										: `text-muted-foreground hover:bg-accent
											hover:text-foreground`
								)}
								onClick={() => onSelect(section.id)}
							>
								<span
									className={cn(
										'mt-0.5 rounded-lg border p-2',
										isActive
											? 'border-primary/30 bg-primary/10 text-primary'
											: 'border-border bg-background text-muted-foreground'
									)}
								>
									<Icon className="size-4" />
								</span>
								<span className="min-w-0">
									<span className="block text-sm font-medium">
										{section.label}
									</span>
									<span
										className="mt-1 block text-xs leading-5
											text-muted-foreground"
									>
										{section.description}
									</span>
								</span>
							</button>
						);
					})}
				</nav>
			</ScrollArea>
		</aside>
	);
}
