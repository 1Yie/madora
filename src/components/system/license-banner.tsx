import { Crown, OctagonX, ShieldAlert } from 'lucide-react';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { LicenseActivationDialog } from '@/components/system/license-activation-dialog';
import { useLicense } from '@/context/license-provider';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';

function TrialBanner() {
	const { t } = useTranslation();
	const { status, isLoading, deactivate } = useLicense();
	const [showActivation, setShowActivation] = useState(false);
	const [switchingToTrial, setSwitchingToTrial] = useState(false);

	const handleActivated = useCallback(() => {
		setShowActivation(false);
	}, []);

	const handleSwitchToTrial = useCallback(async () => {
		setSwitchingToTrial(true);
		try {
			await deactivate();
		} finally {
			setSwitchingToTrial(false);
		}
	}, [deactivate]);

	if (!status) return null;

	if (status.state === 'active') return null;

	if (status.state === 'revoked') {
		const trialDays = status.trialDaysRemaining;
		const hasTrial = trialDays !== null && trialDays > 0;

		return (
			<>
				<div
					className="fixed inset-0 z-30 flex items-center justify-center
						bg-background/95 backdrop-blur-sm"
				>
					<div className="flex flex-col items-center gap-6 px-8 text-center">
						<div
							className="flex size-16 items-center justify-center rounded-full
								bg-destructive/10"
						>
							<OctagonX className="size-8 text-destructive" strokeWidth={1.5} />
						</div>
						{isLoading ? (
							<div className="space-y-3">
								<Spinner className="mx-auto size-5" />
								<p className="text-sm text-muted-foreground">
									{t('licenseBanner.verifying')}
								</p>
							</div>
						) : (
							<>
								<div className="space-y-2">
									<h2 className="text-xl font-semibold text-foreground">
										{t('licenseBanner.revoked.title')}
									</h2>
									<p className="text-sm text-muted-foreground">
										{t('licenseBanner.revoked.description')}
									</p>
								</div>
								<div className="flex flex-col gap-2 sm:flex-row">
									<Button
										size="lg"
										className="gap-2"
										disabled={switchingToTrial || isLoading}
										onClick={() => setShowActivation(true)}
									>
										<Crown className="size-4" />
										{t('licenseBanner.revoked.action')}
									</Button>
									{hasTrial && (
										<Button
											variant="link"
											disabled={switchingToTrial || isLoading}
											onClick={handleSwitchToTrial}
										>
											{switchingToTrial && <Spinner className="size-4" />}
											{t('licenseBanner.revoked.switchToTrial')}
										</Button>
									)}
								</div>
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
									{t('licenseBanner.verifying')}
								</p>
							</div>
						) : (
							<>
								<div className="space-y-2">
									<h2 className="text-xl font-semibold text-foreground">
										{t('licenseBanner.expired.title')}
									</h2>
									<p className="text-sm text-muted-foreground">
										{t('licenseBanner.expired.description')}
									</p>
								</div>
								<Button
									size="lg"
									className="gap-2"
									onClick={() => setShowActivation(true)}
								>
									<Crown className="size-4" />
									{t('licenseBanner.expired.action')}
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
					{t('licenseBanner.trial.remaining', { days: daysRemaining })}
				</span>
				<Button
					variant="link"
					size="xs"
					className="h-auto text-xs text-amber-700 underline underline-offset-2
						hover:text-amber-800 dark:text-amber-400 dark:hover:text-amber-300"
					onClick={() => setShowActivation(true)}
					disabled={isLoading}
				>
					{t('licenseBanner.trial.action')}
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
