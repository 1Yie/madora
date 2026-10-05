import { SlidersHorizontal } from '@phosphor-icons/react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AboutSettings } from '@/components/system/setting/about';
import { AppearanceSettings } from '@/components/system/setting/appearance';
import { EditorSettings } from '@/components/system/setting/editor';
import { SyncSettings } from '@/components/system/setting/sync';
import { Button } from '@/components/ui/button';
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from '@/components/ui/tooltip';
import { WorkbenchPage } from '@/components/ui/workbench-page';
import {
	getSettingsSections,
	type SettingsSectionId,
} from '@/components/system/setting/types';

function SettingsContent({ section }: { section: SettingsSectionId }) {
	if (section === 'editor') return <EditorSettings />;
	if (section === 'sync') return <SyncSettings />;
	if (section === 'about') return <AboutSettings />;
	return <AppearanceSettings />;
}

/** Sidebar footer button that opens the settings page. */
export function SettingsButton({ onClick }: { onClick: () => void }) {
	const { t } = useTranslation();
	return (
		<Tooltip>
			<TooltipTrigger
				render={
					<Button
						aria-label={t('settings.openAria')}
						className="text-muted-foreground hover:bg-sidebar-accent
							hover:text-sidebar-accent-foreground"
						size="icon-sm"
						variant="ghost"
						onClick={onClick}
					/>
				}
			>
				<SlidersHorizontal size={16} />
			</TooltipTrigger>
			<TooltipContent side="top">{t('settings.dialogTitle')}</TooltipContent>
		</Tooltip>
	);
}

/** Full-window settings page, built on the shared `WorkbenchPage` shell. */
export function SettingsPage({
	open,
	onClose,
}: {
	open: boolean;
	onClose: () => void;
}) {
	const { t } = useTranslation();
	const [activeSection, setActiveSection] =
		useState<SettingsSectionId>('appearance');
	const sections = useMemo(() => getSettingsSections(t), [t]);
	const groups = useMemo(
		() => [
			{ id: 'basic', label: t('settings.groups.basic') },
			{ id: 'system', label: t('settings.groups.system') },
		],
		[t]
	);
	const current = sections.find((s) => s.id === activeSection) ?? sections[0];

	return (
		<WorkbenchPage
			open={open}
			onClose={onClose}
			title={t('settings.dialogTitle')}
			backLabel={t('settings.back')}
			items={sections}
			groups={groups}
			activeId={current.id}
			onSelect={(id) => setActiveSection(id as SettingsSectionId)}
			heading={current.label}
		>
			<SettingsContent section={current.id} />
		</WorkbenchPage>
	);
}
