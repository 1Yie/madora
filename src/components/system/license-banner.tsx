import { Crown, ShieldAlert } from 'lucide-react';
import { useCallback, useState } from 'react';
import { LicenseActivationDialog } from '@/components/system/license-activation-dialog';
import { useLicense } from '@/components/system/license-provider';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';

function TrialBanner() {
	const { status, isLoading } = useLicense();
	const [showActivation, setShowActivation] = useState(false);

	const handleActivated = useCallback(() => {
		setShowActivation(false);
	}, []);

	if (!status) return null;

	if (status.state === 'active') return null;

	if (status.state === 'expired') {
		return (
			<>
				<div
					className="fixed inset-0 z-30 flex items-center justify-center
						bg-background/95 backdrop-blur-sm"
				>
					<div
						className="flex max-w-md flex-col items-center gap-6 px-8
							text-center"
					>
						<div
							className="flex size-16 items-center justify-center rounded-full
								bg-destructive/10"
						>
							<ShieldAlert
								className="size-8 text-destructive"
								strokeWidth={1.5}
							/>
						</div>
						{isLoading ? (
							<div className="space-y-3">
								<Spinner className="mx-auto size-5" />
								<p className="text-sm text-muted-foreground">
									正在验证许可证...
								</p>
							</div>
						) : (
							<>
								<div className="space-y-2">
									<h2 className="text-xl font-semibold text-foreground">
										试用期已结束
									</h2>
									<p className="text-sm text-muted-foreground">
										您的 14 天试用期已到期。请激活许可证以继续使用 Madora。
									</p>
								</div>
								<Button
									size="lg"
									className="gap-2"
									onClick={() => setShowActivation(true)}
								>
									<Crown className="size-4" />
									激活许可证
								</Button>
							</>
						)}
					</div>
				</div>
				<LicenseActivationDialog
					open={showActivation}
					onOpenChange={setShowActivation}
					onActivated={handleActivated}
				/>
			</>
		);
	}

	// Trial state
	const daysRemaining = status.trialDaysRemaining ?? 0;

	return (
		<>
			<div
				className="flex items-center justify-center gap-2 border-b
					bg-amber-500/10"
			>
				<span className="text-xs text-amber-700 dark:text-amber-400">
					试用期剩余 <span className="font-semibold">{daysRemaining}</span> 天
				</span>
				<Button
					variant="link"
					size="xs"
					className="h-auto text-xs text-amber-700 underline underline-offset-2
						hover:text-amber-800 dark:text-amber-400 dark:hover:text-amber-300"
					onClick={() => setShowActivation(true)}
					disabled={isLoading}
				>
					激活
				</Button>
			</div>
			<LicenseActivationDialog
				open={showActivation}
				onOpenChange={setShowActivation}
				onActivated={handleActivated}
			/>
		</>
	);
}

export { TrialBanner as LicenseBanner };
