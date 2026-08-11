import type { TFunction } from 'i18next';
import {
	Cloud,
	Keyboard,
	Palette,
	GearSix as Settings2,
	ShieldCheck,
} from '@phosphor-icons/react';

export type SettingsSectionId =
	| 'appearance'
	| 'editor'
	| 'license'
	| 'sync'
	| 'about';

export type SettingsSection = {
	id: SettingsSectionId;
	label: string;
	icon: typeof Palette;
};

export function getSettingsSections(t: TFunction): SettingsSection[] {
	return [
		{
			id: 'appearance',
			label: t('settings.sections.appearance.label'),
			icon: Palette,
		},
		{
			id: 'editor',
			label: t('settings.sections.editor.label'),
			icon: Keyboard,
		},
		{
			id: 'sync',
			label: t('settings.sections.sync.label'),
			icon: Cloud,
		},
		{
			id: 'license',
			label: t('settings.sections.license.label'),
			icon: ShieldCheck,
		},
		{
			id: 'about',
			label: t('settings.sections.about.label'),
			icon: Settings2,
		},
	];
}
