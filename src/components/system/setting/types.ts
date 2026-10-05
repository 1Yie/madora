import type { TFunction } from 'i18next';
import {
	Cloud,
	Keyboard,
	Palette,
	Settings as Settings2,
} from '@keyline-icons/react';

export type SettingsSectionId = 'appearance' | 'editor' | 'sync' | 'about';

export type SettingsSection = {
	id: SettingsSectionId;
	label: string;
	icon: typeof Palette;
	group: 'basic' | 'system';
};

export function getSettingsSections(t: TFunction): SettingsSection[] {
	return [
		{
			id: 'appearance',
			label: t('settings.sections.appearance.label'),
			icon: Palette,
			group: 'basic',
		},
		{
			id: 'editor',
			label: t('settings.sections.editor.label'),
			icon: Keyboard,
			group: 'basic',
		},
		{
			id: 'sync',
			label: t('settings.sections.sync.label'),
			icon: Cloud,
			group: 'basic',
		},
		{
			id: 'about',
			label: t('settings.sections.about.label'),
			icon: Settings2,
			group: 'system',
		},
	];
}
