import { useTheme } from "@/components/system/theme-provider";

import { SettingsSectionCard, ThemeOption } from "@/components/system/setting/shared";

export function AppearanceSettings() {
  const { theme, setTheme } = useTheme();

  return (
    <div className="space-y-4">
      <SettingsSectionCard description="当前提供浅色与深色两套界面方案。" title="主题模式">
        <div className="grid gap-3 md:grid-cols-2">
          <ThemeOption
            active={theme === "light"}
            description="更适合明亮环境，页面层次会更轻。"
            label="浅色"
            onClick={() => setTheme("light")}
          />
          <ThemeOption
            active={theme === "dark"}
            description="适合夜间或长时间阅读，界面对比更柔和。"
            label="深色"
            onClick={() => setTheme("dark")}
          />
        </div>
      </SettingsSectionCard>
    </div>
  );
}