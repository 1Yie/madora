import type { TFunction } from 'i18next';
import { Cloud, Keyboard, Palette, Settings2, ShieldCheck } from 'lucide-react';

export type SettingsSectionId =
	| 'appearance'
	| 'editor'
	| 'license'
	| 'sync'
	| 'about';

export type SettingsSection = {
	id: SettingsSectionId;
	label: string;
	description: string;
	icon: typeof Palette;
};

export function getSettingsSections(t: TFunction): SettingsSection[] {
	return [
		{
			id: 'appearance',
			label: t('settings.sections.appearance.label'),
			description: t('settings.sections.appearance.description'),
			icon: Palette,
		},
		{
			id: 'editor',
			label: t('settings.sections.editor.label'),
			description: t('settings.sections.editor.description'),
			icon: Keyboard,
		},
		{
			id: 'sync',
			label: t('settings.sections.sync.label'),
			description: t('settings.sections.sync.description'),
			icon: Cloud,
		},
		{
			id: 'license',
			label: t('settings.sections.license.label'),
			description: t('settings.sections.license.description'),
			icon: ShieldCheck,
		},
		{
			id: 'about',
			label: t('settings.sections.about.label'),
			description: t('settings.sections.about.description'),
			icon: Settings2,
		},
	];
}
