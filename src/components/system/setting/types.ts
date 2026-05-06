import { Palette, Settings2 } from "lucide-react";

export type SettingsSectionId = "appearance" | "about";

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
    description: "主题与界面显示",
    icon: Palette,
  },
  {
    id: "about",
    label: "关于",
    description: "产品信息与方向",
    icon: Settings2,
  },
];
