import { openUrl } from '@/invoke/opener';
import { ExternalLink } from 'lucide-react';
import type React from 'react';

import { showErrorToast } from '@/components/ui/toast';
import { cn } from '@/lib/utils';

type ExternalLinkProps = Omit<
	React.AnchorHTMLAttributes<HTMLAnchorElement>,
	'href' | 'onClick'
> & {
	children: React.ReactNode;
	href: string;
};

function getErrorMessage(error: unknown): string {
	if (error instanceof Error) {
		return error.message;
	}

	if (typeof error === 'string') {
		return error;
	}

	return '无法打开链接';
}

export function ExternalLinkAnchor({
	children,
	className,
	href,
	...props
}: ExternalLinkProps): React.ReactElement {
	return (
		<a
			{...props}
			className={cn(
				`inline-flex items-center gap-1.5 break-all text-sm font-medium
				text-primary underline-offset-4 transition-colors hover:text-primary/80
				hover:underline`,
				className
			)}
			href={href}
			onClick={(event) => {
				event.preventDefault();

				void openUrl(href).catch((error) => {
					showErrorToast('打开链接失败', getErrorMessage(error));
				});
			}}
		>
			<span>{children}</span>
			<ExternalLink className="size-3.5 shrink-0" />
		</a>
	);
}
