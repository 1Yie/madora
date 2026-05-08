import { Keyboard, Palette, Settings2 } from "lucide-react";

export type SettingsSectionId = "appearance" | "editor" | "about";

export type SettingsSection = {
  id: SettingsSectionId;
  label: string;
  description: string;
  icon: typeof Palette;
};

export const settingsSections: SettingsSection[] = [
  {
    id: "appearance",
    label: "外观",
    description: "主题与界面",
    icon: Palette,
  },
  {
    id: "editor",
    label: "编辑器",
    description: "输入与编辑",
    icon: Keyboard,
  },
  {
    id: "about",
    label: "关于",
    description: "产品与方向",
    icon: Settings2,
  },
];
