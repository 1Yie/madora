import { Loader2, ExternalLink } from 'lucide-react';
import { useCallback, useRef, useState } from 'react';
import { useLicense } from '@/context/license-provider';
import { Button } from '@/components/ui/button';
import {
	Dialog,
	DialogClose,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogPopup,
	DialogTitle,
} from '@/components/ui/dialog';
import { OTPFieldSeparator } from '@/components/ui/otp-field';
import { showErrorToast, showSuccessToast } from '@/components/ui/toast';
import { cn } from '@/lib/utils';

interface LicenseActivationDialogProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	onActivated?: () => void;
}

const GROUP_COUNT = 5;
const GROUP_SIZE = 4;
const PREFIX = 'MADO';

const PURCHASE_URL = 'https://madora.ichiyo.in/purchase';

function sanitizeGroup(value: string): string {
	return value.replace(/[^0-9A-Za-z]/g, '').toUpperCase();
}

function groupsToKey(groups: string[]): string {
	return groups.join('-');
}

export function LicenseActivationDialog({
	open,
	onOpenChange,
	onActivated,
}: LicenseActivationDialogProps) {
	const { activate, isLoading } = useLicense();
	const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

	const [groups, setGroups] = useState<string[]>([PREFIX, '', '', '', '']);

	const handleOpenChange = useCallback(
		(change: boolean) => {
			if (!change) {
				setGroups([PREFIX, '', '', '', '']);
			}
			onOpenChange(change);
		},
		[onOpenChange]
	);

	const handleChange = useCallback((index: number, raw: string) => {
		const cleaned = sanitizeGroup(raw).slice(0, GROUP_SIZE);
		setGroups((prev) => {
			const next = [...prev];
			next[index] = cleaned;
			return next;
		});

		if (cleaned.length === GROUP_SIZE && index < GROUP_COUNT - 1) {
			inputRefs.current[index + 1]?.focus();
		}
	}, []);

	const handleKeyDown = useCallback(
		(index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
			if (e.key === 'Backspace' && groups[index] === '' && index > 1) {
				inputRefs.current[index - 1]?.focus();
			}
			if (e.key === 'ArrowLeft' && index > 1) {
				const input = e.currentTarget;
				if (input.selectionStart === 0) {
					inputRefs.current[index - 1]?.focus();
				}
			}
		},
		[groups]
	);

	const handlePaste = useCallback(
		(e: React.ClipboardEvent) => {
			const pasted = e.clipboardData.getData('text');
			const cleaned = sanitizeGroup(pasted);
			if (cleaned.length === 0) return;

			e.preventDefault();

			const startIndex = cleaned.startsWith(PREFIX) ? 0 : 1;
			const base = startIndex === 0 ? cleaned : PREFIX + cleaned;

			const next = [...groups];
			for (let i = 0; i < GROUP_COUNT; i++) {
				const start = i * GROUP_SIZE;
				next[i] = base.slice(start, start + GROUP_SIZE);
			}
			setGroups(next);
		},
		[groups]
	);

	const handleSubmit = useCallback(
		async (e: React.FormEvent) => {
			e.preventDefault();

			if (groups.some((g) => g.length < GROUP_SIZE)) {
				showErrorToast('请输入完整的许可证密钥');
				return;
			}

			const key = groupsToKey(groups);

			try {
				await activate(key);
				showSuccessToast('激活成功');
				onOpenChange(false);
				onActivated?.();
			} catch {
				// Error toast is already shown by LicenseProvider
			}
		},
		[groups, activate, onOpenChange, onActivated]
	);

	const slotClass = cn(
		'h-9 w-[4.25rem] rounded-lg border border-input bg-background',
		'text-center font-mono text-sm tracking-[0.3em]',
		'shadow-xs/5 outline-none ring-ring/24 transition-shadow',
		'before:pointer-events-none before:absolute before:inset-0',
		'focus-visible:z-10 focus-visible:border-ring focus-visible:shadow-none',
		'focus-visible:ring-[3px] focus-visible:ring-ring/24',
		'aria-invalid:border-destructive/36 aria-invalid:shadow-none',
		'disabled:opacity-64 disabled:shadow-none',
		'dark:bg-input/32 dark:not-focus-visible:before:shadow-[0_-1px_--theme(--color-white/6%)]',
		'sm:h-8'
	);

	const inputs = Array.from({ length: GROUP_COUNT }, (_, i) => i);

	return (
		<Dialog open={open} onOpenChange={handleOpenChange}>
			<DialogPopup showCloseButton={false}>
				<DialogHeader>
					<DialogTitle>激活许可证</DialogTitle>
					<DialogDescription>请输入许可证密钥以激活 Madora。</DialogDescription>
				</DialogHeader>
				<form onSubmit={handleSubmit}>
					<div className="space-y-4 px-6 pb-4">
						<div className="space-y-3">
							<label className="text-sm font-medium text-foreground">
								许可证密钥
							</label>
							<div className="flex items-center gap-2">
								{inputs.map((i) => (
									<span key={i} className="flex items-center gap-2">
										{i > 0 && <OTPFieldSeparator />}
										<input
											ref={(el) => {
												inputRefs.current[i] = el;
											}}
											className={slotClass}
											type="text"
											value={groups[i]}
											maxLength={GROUP_SIZE}
											disabled={i === 0 || isLoading}
											readOnly={i === 0}
											autoComplete="off"
											spellCheck={false}
											inputMode="text"
											onChange={(e) => handleChange(i, e.target.value)}
											onKeyDown={(e) => handleKeyDown(i, e)}
											onPaste={handlePaste}
										/>
									</span>
								))}
							</div>
						</div>
						<p className="text-center text-xs text-muted-foreground">
							还没有许可证？{' '}
							<a
								href={PURCHASE_URL}
								target="_blank"
								rel="noopener noreferrer"
								className="inline-flex items-center gap-0.5 font-medium
									text-primary underline-offset-4 hover:underline"
							>
								前往购买
								<ExternalLink className="size-2.5" />
							</a>
						</p>
					</div>
					<DialogFooter>
						<DialogClose
							render={<Button variant="outline" disabled={isLoading} />}
						>
							取消
						</DialogClose>
						<Button type="submit" disabled={isLoading}>
							{isLoading && <Loader2 className="animate-spin" />}
							激活
						</Button>
					</DialogFooter>
				</form>
			</DialogPopup>
		</Dialog>
	);
}
