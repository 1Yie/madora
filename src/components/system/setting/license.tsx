import {
	Crown,
	ExternalLink,
	KeyRound,
	Loader2,
	ShieldAlert,
	ShieldCheck,
	Zap,
} from 'lucide-react';
import { useCallback, useState } from 'react';
import { useLicense } from '@/components/system/license-provider';
import { SettingsSectionCard } from '@/components/system/setting/shared';
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
import { showErrorToast, showSuccessToast } from '@/components/ui/toast';
import { cn } from '@/lib/utils';

const PURCHASE_URL = 'https://madora.ichiyo.in/purchase';

type LicenseState = 'active' | 'expired' | 'trial';

interface StatusConfig {
	icon: React.ComponentType<{ className?: string }>;
	label: string;
	description?: string;
	iconClass: string;
	iconBg: string;
	badgeClass: string;
}

const STATUS_CONFIGS: Record<LicenseState, StatusConfig> = {
	active: {
		icon: ShieldCheck,
		label: '已激活',
		iconClass: 'text-emerald-700 dark:text-emerald-400',
		iconBg:
			'bg-emerald-50 border border-emerald-200 dark:bg-emerald-950 dark:border-emerald-800',
		badgeClass:
			'bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-300',
	},
	expired: {
		icon: ShieldAlert,
		label: '已过期',
		iconClass: 'text-destructive',
		iconBg: 'bg-destructive/5 border border-destructive/20',
		badgeClass: 'bg-destructive/10 text-destructive dark:bg-destructive/20',
	},
	trial: {
		icon: Zap,
		label: '试用中',
		iconClass: 'text-amber-700 dark:text-amber-400',
		iconBg:
			'bg-amber-50 border border-amber-200 dark:bg-amber-950 dark:border-amber-800',
		badgeClass:
			'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-300',
	},
};

export function LicenseSettings({
	onRequestActivation,
}: {
	onRequestActivation: () => void;
}) {
	const { status, isLoading, deactivate } = useLicense();
	const [showDeactivateConfirm, setShowDeactivateConfirm] = useState(false);
	const [isDeactivating, setIsDeactivating] = useState(false);

	const handleDeactivate = useCallback(async () => {
		setIsDeactivating(true);
		try {
			await deactivate();
			showSuccessToast('许可证已停用');
			setShowDeactivateConfirm(false);
		} catch (error) {
			showErrorToast('停用失败', String(error));
		} finally {
			setIsDeactivating(false);
		}
	}, [deactivate]);

	if (isLoading || !status) {
		return (
			<div
				className="flex items-center gap-2 py-4 text-sm text-muted-foreground"
			>
				<Loader2 className="size-4 animate-spin" />
				加载许可证信息...
			</div>
		);
	}

	const licenseState: LicenseState =
		status.state === 'active'
			? 'active'
			: status.state === 'expired'
				? 'expired'
				: 'trial';

	const isActive = licenseState === 'active';
	const trialDays = status.trialDaysRemaining ?? 0;

	const statusConfig: StatusConfig = {
		...STATUS_CONFIGS[licenseState],
		...(licenseState === 'trial' && {
			description: `剩余 ${trialDays} 天试用期`,
		}),
	};

	const StatusIcon = statusConfig.icon;

	const maskedKey = (() => {
		if (!status.licenseKey) return null;
		const parts = status.licenseKey.split('-');
		return parts.length === 5
			? `${parts[0]}-****-****-****-${parts[4]}`
			: '****-****-****-****';
	})();

	return (
		<div className="space-y-6">
			<SettingsSectionCard title="许可证详情">
				<div className="-mx-5 -mb-5 overflow-hidden">
					<div className="flex items-start justify-between gap-3 px-5 pb-4">
						<div className="flex items-start gap-1">
							<div
								className={cn(
									'mt-0.5 size-8 shrink-0 items-center justify-center '
								)}
							>
								<StatusIcon className={cn('size-5', statusConfig.iconClass)} />
							</div>
							<div>
								<div className="flex items-center gap-1.5">
									<span className="text-sm font-medium text-foreground">
										{isActive ? '已授权' : 'Madora 许可证'}
									</span>
								</div>
								<p
									className="mt-1 text-xs leading-relaxed text-muted-foreground"
								>
									{statusConfig.description ||
										(isActive
											? '当前设备已获得完整功能访问权限。'
											: '未检测到有效的许可证。')}
								</p>
							</div>
						</div>
						{!isActive && (
							<Button
								size="sm"
								variant="outline"
								className="h-7 shrink-0 gap-1.5 text-xs"
								onClick={onRequestActivation}
							>
								<Crown className="size-3" />
								激活
							</Button>
						)}
					</div>

					{isActive && maskedKey && (
						<div
							className="flex items-center justify-between border-t
								border-border/60 bg-muted/30 px-5 py-2.5"
						>
							<div className="flex items-center gap-2">
								<KeyRound className="size-3 text-muted-foreground/60" />
								<span
									className="font-mono text-[12px] tracking-wider
										text-muted-foreground"
								>
									{maskedKey}
								</span>
							</div>
							<Button
								variant="ghost"
								size="sm"
								className="h-7 text-xs text-destructive hover:bg-destructive/10
									hover:text-destructive"
								onClick={() => setShowDeactivateConfirm(true)}
							>
								停用此设备
							</Button>
						</div>
					)}

					{isActive && !maskedKey && (
						<div
							className="flex items-center justify-between border-t
								border-border/60 bg-muted/30 px-5 py-2.5"
						>
							<p className="text-xs text-muted-foreground">
								需要在其他设备上使用？请先停用当前设备。
							</p>
							<Button
								variant="ghost"
								size="sm"
								onClick={() => setShowDeactivateConfirm(true)}
							>
								停用此设备
							</Button>
						</div>
					)}

					{!isActive && (
						<div
							className="flex items-center gap-1.5 border-t border-border/60
								bg-muted/20 px-5 py-2.5"
						>
							<p className="text-xs text-muted-foreground">
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
					)}
				</div>
			</SettingsSectionCard>

			<Dialog
				open={showDeactivateConfirm}
				onOpenChange={setShowDeactivateConfirm}
			>
				<DialogPopup>
					<DialogHeader>
						<DialogTitle>确认停用</DialogTitle>
						<DialogDescription>
							停用后当前设备将无法使用 Madora
							的专业功能，直到重新激活。你随后可以在其他设备上使用此许可证密钥。
						</DialogDescription>
					</DialogHeader>
					<DialogFooter>
						<DialogClose
							render={<Button variant="outline" disabled={isDeactivating} />}
						>
							取消
						</DialogClose>
						<Button
							variant="destructive"
							disabled={isDeactivating}
							onClick={handleDeactivate}
							className="gap-1.5"
						>
							{isDeactivating && <Loader2 className="size-3.5 animate-spin" />}
							停用
						</Button>
					</DialogFooter>
				</DialogPopup>
			</Dialog>
		</div>
	);
}
