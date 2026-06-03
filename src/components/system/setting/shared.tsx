import { type ReactNode } from 'react';
import { cn } from '@/lib/utils';

export function SettingsSectionCard({
	title,
	description,
	children,
}: {
	title: string;
	description?: string;
	children: ReactNode;
}) {
	return (
		<section className="rounded-2xl border bg-card p-4 shadow-xs sm:p-5">
			<div className="space-y-1">
				<h3 className="text-sm font-semibold text-foreground sm:text-base">
					{title}
				</h3>
				<p className="text-xs text-muted-foreground sm:text-sm">
					{description}
				</p>
			</div>
			<div className="mt-4">{children}</div>
		</section>
	);
}

export function Stat({ label, value }: { label: string; value: ReactNode }) {
	return (
		<div className="rounded-xl border border-border bg-background px-4 py-3">
			<div className="text-xs uppercase tracking-[0.16em] text-muted-foreground">
				{label}
			</div>
			<div
				className="mt-2 break-all text-sm font-medium text-foreground
					sm:text-base"
			>
				{value}
			</div>
		</div>
	);
}

export function Option({
	active,
	label,
	icon,
	description,
	onClick,
}: {
	active: boolean;
	description?: string;
	label: string;
	icon?: ReactNode;
	onClick: () => void;
}) {
	return (
		<button
			type="button"
			className={cn(
				'rounded-xl border px-4 py-3 text-left transition-colors',
				active
					? 'border-primary bg-primary/8 text-foreground shadow-xs'
					: `border-border bg-background text-muted-foreground hover:bg-accent
						hover:text-foreground`
			)}
			onClick={onClick}
		>
			<div className="flex items-center justify-between gap-3">
				<div className="flex items-center gap-2.5">
					{icon && (
						<div className="flex shrink-0 items-center justify-center">
							{icon}
						</div>
					)}
					<span className="text-sm font-medium">{label}</span>
				</div>
				<div className="flex items-center gap-2">
					<span
						className={cn(
							'size-2.5 rounded-full transition-colors',
							active ? 'bg-primary' : 'bg-border'
						)}
					/>
				</div>
			</div>
			{description && <p className="mt-1 text-xs leading-5">{description}</p>}
		</button>
	);
}

export function SettingRow({
	title,
	description,
	children,
}: {
	title: ReactNode;
	description?: ReactNode;
	children: ReactNode;
}) {
	return (
		<div
			className="flex items-center justify-between gap-4 rounded-xl border
				border-border bg-background px-4 py-3"
		>
			<div className="min-w-0 space-y-0.5">
				<div className="text-sm font-medium text-foreground">{title}</div>
				{description && (
					<p className="text-xs text-muted-foreground">{description}</p>
				)}
			</div>
			<div className="shrink-0">{children}</div>
		</div>
	);
}

export function FieldBlock({
	label,
	hint,
	children,
	icon,
}: {
	label: string;
	hint?: ReactNode;
	children: ReactNode;
	icon?: ReactNode;
}) {
	return (
		<div className="space-y-1.5">
			<div className="flex items-center gap-1.5">
				{icon && (
					<span className="text-muted-foreground [&>svg]:size-3.5">{icon}</span>
				)}
				<span className="text-sm font-medium text-foreground">{label}</span>
			</div>
			{children}
			{hint && <p className="text-xs text-muted-foreground">{hint}</p>}
		</div>
	);
}
