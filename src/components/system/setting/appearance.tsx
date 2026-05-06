import { MoonStar } from "lucide-react";
import { useTheme } from "@/components/system/theme-provider";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { type ReactNode } from "react";

function SettingsSectionCard({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-2xl border bg-card/80 p-4 shadow-xs sm:p-5">
      <div className="space-y-1">
        <h3 className="text-sm font-semibold text-foreground sm:text-base">{title}</h3>
        <p className="text-xs text-muted-foreground sm:text-sm">{description}</p>
      </div>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function ThemeOption({
  active,
  description,
  label,
  onClick,
}: {
  active: boolean;
  description: string;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={cn(
        "rounded-xl border px-4 py-3 text-left transition-colors",
        active
          ? "border-primary bg-primary/8 text-foreground shadow-xs"
          : "border-border/70 bg-background/70 text-muted-foreground hover:bg-accent/60 hover:text-foreground",
      )}
      onClick={onClick}
    >
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm font-medium">{label}</span>
        <span className={cn("size-2.5 rounded-full transition-colors", active ? "bg-primary" : "bg-border")} />
      </div>
      <p className="mt-1 text-xs leading-5">{description}</p>
    </button>
  );
}

export function AppearanceSettings() {
  const { theme, setTheme } = useTheme();

  return (
    <div className="space-y-4">
      <SettingsSectionCard description="当前提供浅色与深色两套界面方案。" title="主题模式">
        <div className="grid gap-3 md:grid-cols-2">
          <ThemeOption active={theme === "light"} description="更适合明亮环境，页面层次会更轻。" label="浅色" onClick={() => setTheme("light")} />
          <ThemeOption active={theme === "dark"} description="适合夜间或长时间阅读，界面对比更柔和。" label="深色" onClick={() => setTheme("dark")} />
        </div>
      </SettingsSectionCard>
      <SettingsSectionCard description="保留一个更直接的开关，方便快速切换。" title="快速切换">
        <div className="flex items-center justify-between gap-4 rounded-xl border border-border/70 bg-background/70 px-4 py-3">
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-sm font-medium text-foreground">
              <MoonStar className="size-4" />
              深色模式
            </div>
            <p className="text-xs text-muted-foreground">打开后会立即切换整体配色，并保存到本地。</p>
          </div>
          <Switch
            checked={theme === "dark"}
            onCheckedChange={(checked: boolean) => setTheme(checked ? "dark" : "light")}
          />
        </div>
      </SettingsSectionCard>
    </div>
  );
}
