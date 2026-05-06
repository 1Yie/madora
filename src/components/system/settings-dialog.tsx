import { Palette, Settings2 } from "lucide-react";
import { useState, type ReactNode } from "react";

import { useTheme } from "@/components/system/theme-provider";
import { Button } from "@/components/ui/button";
import {
  NativeDialog,
  NativeDialogClose,
  NativeDialogHeader,
  NativeDialogTitle,
} from "@/components/ui/native-dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

type SettingsSectionId = "appearance" | "workspace" | "about";

type SettingsSection = {
  id: SettingsSectionId;
  label: string;
  description: string;
  icon: typeof Palette;
};

const settingsSections: SettingsSection[] = [
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
        <span
          className={cn(
            "size-2.5 rounded-full transition-colors",
            active ? "bg-primary" : "bg-border",
          )}
        />
      </div>
      <p className="mt-1 text-xs leading-5">{description}</p>
    </button>
  );
}

function AppearanceSettings() {
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

function AboutSettings() {
  return (
    <div className="space-y-4">
      <SettingsSectionCard description="说明当前设置页的定位与扩展方向。" title="关于设置中心">
        <div className="space-y-3 text-sm leading-6 text-muted-foreground">
          <p>设置中心采用左侧功能导航、右侧详情面板的结构，便于逐步扩展更多桌面端能力。</p>
          <p>现在已经接入外观配置，后续可以继续补充编辑器、工作区和同步等选项。</p>
        </div>
      </SettingsSectionCard>
    </div>
  );
}

function SettingsContent({ section }: { section: SettingsSectionId }) {
  if (section === "about") {
    return <AboutSettings />;
  }

  return <AppearanceSettings />;
}

export function SettingsDialog() {
  const [open, setOpen] = useState(false);
  const [activeSection, setActiveSection] = useState<SettingsSectionId>("appearance");

  const currentSection =
    settingsSections.find((section) => section.id === activeSection) ?? settingsSections[0];

  return (
    <>
      <Button
        aria-label="打开设置"
        className="h-full rounded-none border-transparent px-3 text-muted-foreground hover:bg-accent hover:text-accent-foreground"
        size="sm"
        variant="ghost"
        onClick={() => setOpen(true)}
      >
        <Settings2 size={14} />
      </Button>
      <NativeDialog
        className="max-h-[min(85vh,720px)] max-w-[min(960px,calc(100vw-2rem))] overflow-hidden"
        onOpenChange={setOpen}
        open={open}
      >
        <div className="flex min-h-[min(70vh,620px)] min-w-0 flex-col">
          <NativeDialogClose
            className="absolute inset-e-3 top-3 z-10"
            onClick={() => setOpen(false)}
          />
          <NativeDialogHeader className="border-b bg-muted/35 pe-14">
            <NativeDialogTitle>设置</NativeDialogTitle>
          </NativeDialogHeader>
          <div className="flex min-h-0 flex-1 min-w-0 flex-col md:flex-row">
            <aside className="border-b bg-muted/25 md:w-64 md:shrink-0 md:border-b-0 md:border-r">
              <ScrollArea className="max-h-60 md:max-h-none" scrollbarGutter>
                <nav className="flex flex-col gap-1 p-3">
                  {settingsSections.map((section) => {
                    const Icon = section.icon;
                    const isActive = currentSection.id === section.id;

                    return (
                      <button
                        key={section.id}
                        aria-current={isActive ? "page" : undefined}
                        type="button"
                        className={cn(
                          "flex items-start gap-3 rounded-xl px-3 py-3 text-left transition-colors",
                          isActive
                            ? "bg-primary/10 text-foreground"
                            : "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
                        )}
                        onClick={() => setActiveSection(section.id)}
                      >
                        <span
                          className={cn(
                            "mt-0.5 rounded-lg border p-2",
                            isActive
                              ? "border-primary/30 bg-primary/10 text-primary"
                              : "border-border/70 bg-background/70 text-muted-foreground",
                          )}
                        >
                          <Icon className="size-4" />
                        </span>
                        <span className="min-w-0">
                          <span className="block text-sm font-medium">{section.label}</span>
                          <span className="mt-1 block text-xs leading-5 text-muted-foreground">
                            {section.description}
                          </span>
                        </span>
                      </button>
                    );
                  })}
                </nav>
              </ScrollArea>
            </aside>
            <section className="min-h-0 min-w-0 flex-1 bg-popover">
              <ScrollArea scrollFade scrollbarGutter>
                <div className="space-y-6 p-4 sm:p-6">
                  <div className="space-y-1">
                    <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
                      {currentSection.label}
                    </p>
                    <h3 className="text-2xl font-semibold text-foreground">
                      {currentSection.description}
                    </h3>
                  </div>
                  <SettingsContent section={currentSection.id} />
                </div>
              </ScrollArea>
            </section>
          </div>
        </div>
      </NativeDialog>
    </>
  );
}
