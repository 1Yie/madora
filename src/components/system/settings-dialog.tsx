import { SlidersHorizontal } from '@phosphor-icons/react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AboutSettings } from '@/components/system/setting/about';
import { AppearanceSettings } from '@/components/system/setting/appearance';
import { EditorSettings } from '@/components/system/setting/editor';
import { LicenseActivationDialog } from '@/components/system/license-activation-dialog';
import { LicenseSettings } from '@/components/system/setting/license';
import { SyncSettings } from '@/components/system/setting/sync';
import { Button } from '@/components/ui/button';
import { DialogWorkbench } from '@/components/ui/dialog-workbench';
import type { DialogSidebarItem } from '@/components/ui/dialog-sidebar';
import {
	getSettingsSections,
	type SettingsSectionId,
} from '@/components/system/setting/types';

function SettingsContent({
	section,
	onRequestLicenseActivation,
}: {
	section: SettingsSectionId;
	onRequestLicenseActivation: () => void;
}) {
	if (section === 'editor') return <EditorSettings />;
	if (section === 'license')
		return <LicenseSettings onRequestActivation={onRequestLicenseActivation} />;
	if (section === 'sync') return <SyncSettings />;
	if (section === 'about') return <AboutSettings />;
	return <AppearanceSettings />;
}

export function SettingsDialog() {
	const { t } = useTranslation();
	const [open, setOpen] = useState(false);
	const [activeSection, setActiveSection] =
		useState<SettingsSectionId>('appearance');
	const [showLicenseActivation, setShowLicenseActivation] = useState(false);
	const scrollRef = useRef<HTMLDivElement>(null);
	const settingsSections = useMemo(() => getSettingsSections(t), [t]);

	useEffect(() => {
		scrollRef.current?.scrollTo(0, 0);
	}, [activeSection]);

	const currentSection =
		settingsSections.find((section) => section.id === activeSection) ??
		settingsSections[0];

	return (
		<>
			<Button
				aria-label={t('settings.openAria')}
				className="h-full rounded-full border-transparent text-muted-foreground
					hover:bg-accent hover:text-accent-foreground"
				size="sm"
				variant="ghost"
				onClick={() => setOpen(true)}
			>
				<SlidersHorizontal size={14} />
			</Button>
			<DialogWorkbench
				open={open}
				onOpenChange={setOpen}
				title={t('settings.dialogTitle')}
				items={settingsSections as DialogSidebarItem[]}
				activeId={activeSection}
				onSelect={(id) => setActiveSection(id as SettingsSectionId)}
			>
				<div
					ref={scrollRef}
					key={activeSection}
					className="overflow-auto size-full min-h-0 flex-1"
				>
					<div className="space-y-6 p-4 sm:p-6">
						<SettingsContent
							section={currentSection.id}
							onRequestLicenseActivation={() => setShowLicenseActivation(true)}
						/>
					</div>
				</div>
			</DialogWorkbench>

			{/* Mounted at the same level as the settings dialog, not nested inside it */}
			<LicenseActivationDialog
				open={showLicenseActivation}
				onOpenChange={setShowLicenseActivation}
			/>
		</>
	);
}
