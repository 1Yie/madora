import { type ReactNode } from 'react';
import { cn } from '@/lib/utils';

export function SettingsSectionCard({
	title,
	description,
	action,
	children,
}: {
	/** Omit when the page heading already names this block. */
	title?: string;
	description?: string;
	action?: ReactNode;
	children: ReactNode;
}) {
	return (
		<section className="space-y-3">
			{title || description || action ? (
				<div className="flex items-end justify-between gap-4">
					<div className="min-w-0">
						{title && (
							<h2 className="text-base font-semibold text-foreground">
								{title}
							</h2>
						)}
						{description && (
							<p className="mt-0.5 text-xs text-muted-foreground">
								{description}
							</p>
						)}
					</div>
					{action ? <div className="shrink-0">{action}</div> : null}
				</div>
			) : null}
			<div>{children}</div>
		</section>
	);
}

/** Card holding `SettingRow`s separated by hairlines. */
export function SettingsGroup({
	className,
	children,
}: {
	className?: string;
	children: ReactNode;
}) {
	return (
		<div
			className={cn(
				`divide-y divide-border overflow-hidden rounded-2xl border border-border
				bg-card`,
				className
			)}
		>
			{children}
		</div>
	);
}

/** Card holding form fields / free-form content. */
export function SettingsPanel({
	className,
	children,
}: {
	className?: string;
	children: ReactNode;
}) {
	return (
		<div
			className={cn(
				'space-y-4 rounded-2xl border border-border bg-card p-4',
				className
			)}
		>
			{children}
		</div>
	);
}

export function Stat({ label, value }: { label: string; value: ReactNode }) {
	return (
		<div>
			<div className="text-xs text-muted-foreground">{label}</div>
			<div
				className="mt-1.5 break-all text-sm font-medium text-foreground
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
			aria-pressed={active}
			className={cn(
				`relative rounded-2xl border px-4 py-3.5 pr-11 text-left
				transition-colors duration-100`,
				active
					? 'border-primary bg-primary/5 ring-1 ring-primary/25'
					: 'border-border bg-card hover:bg-accent/50'
			)}
			onClick={onClick}
		>
			<span
				className={cn(
					`pointer-events-none absolute right-4 top-4 flex size-4 items-center
					justify-center rounded-full border transition-colors`,
					active ? 'border-primary bg-primary' : 'border-input'
				)}
			>
				{active && (
					<span className="size-1.5 rounded-full bg-primary-foreground" />
				)}
			</span>
			<div className="flex items-center gap-2.5">
				{icon && (
					<div
						className="flex shrink-0 items-center justify-center
							text-muted-foreground"
					>
						{icon}
					</div>
				)}
				<span className="text-sm font-semibold text-foreground">{label}</span>
			</div>
			{description && (
				<p className="mt-1.5 text-xs leading-5 text-muted-foreground">
					{description}
				</p>
			)}
		</button>
	);
}

export function SettingRow({
	title,
	description,
	children,
	stacked = false,
	accessory,
	icon,
}: {
	title: ReactNode;
	description?: ReactNode;
	children?: ReactNode;
	stacked?: boolean;
	accessory?: ReactNode;
	icon?: ReactNode;
}) {
	const heading = (
		<div className="flex min-w-0 items-center gap-3">
			{icon ? (
				<span className="shrink-0 text-muted-foreground [&>svg]:size-4">
					{icon}
				</span>
			) : null}
			<div className="min-w-0 space-y-0.5">
				<div className="text-sm font-medium text-foreground">{title}</div>
				{description && (
					<p className="text-xs leading-5 text-muted-foreground">
						{description}
					</p>
				)}
			</div>
		</div>
	);

	if (stacked) {
		return (
			<div className="space-y-3 px-4 py-3.5">
				<div className="flex items-start justify-between gap-4">
					{heading}
					{accessory ? <div className="shrink-0">{accessory}</div> : null}
				</div>
				{children ? <div className="min-w-0">{children}</div> : null}
			</div>
		);
	}

	return (
		<div className="flex items-center justify-between gap-4 px-4 py-3.5">
			{heading}
			<div className="shrink-0">{children}</div>
		</div>
	);
}

export function BrandShard({
	logoSrc,
	appName,
	tagline,
	children,
}: {
	logoSrc: string;
	appName: string;
	tagline: ReactNode;
	children?: ReactNode;
}) {
	return (
		<section>
			<div className="flex flex-col gap-6">
				<div className="flex flex-col items-start gap-4 sm:gap-6">
					<div className="flex items-center gap-3">
						<img
							alt={appName}
							className="size-12 shrink-0 rounded-2xl"
							src={logoSrc}
						/>
						<h1
							className="text-3xl font-medium tracking-tight
								text-muted-foreground"
						>
							{appName}
						</h1>
					</div>
					{tagline}
				</div>
				{children}
			</div>
		</section>
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
