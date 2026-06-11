import {
	Cloud,
	Keyboard,
	Palette,
	Settings2,
	ShieldCheck,
	Terminal,
} from 'lucide-react';

export type SettingsSectionId =
	| 'appearance'
	| 'editor'
	| 'cli'
	| 'license'
	| 'sync'
	| 'about';

export type SettingsSection = {
	id: SettingsSectionId;
	label: string;
	description: string;
	icon: typeof Palette;
};

export const settingsSections: SettingsSection[] = [
	{
		id: 'appearance',
		label: '外观',
		description: '主题与界面',
		icon: Palette,
	},
	{
		id: 'editor',
		label: '编辑器',
		description: '输入与编辑',
		icon: Keyboard,
	},
	{
		id: 'sync',
		label: '同步',
		description: '配置与同步',
		icon: Cloud,
	},
	{
		id: 'cli',
		label: 'CLI',
		description: '命令行工具',
		icon: Terminal,
	},
	{
		id: 'license',
		label: '许可证',
		description: '激活与管理',
		icon: ShieldCheck,
	},
	{
		id: 'about',
		label: '关于',
		description: '产品与方向',
		icon: Settings2,
	},
];
