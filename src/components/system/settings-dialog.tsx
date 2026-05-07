import { Settings2 } from "lucide-react";
import { useState } from "react";
import { AboutSettings } from "@/components/system/setting/about";
import { AppearanceSettings } from "@/components/system/setting/appearance";
import { EditorSettings } from "@/components/system/setting/editor";
import { Button } from "@/components/ui/button";
import { NativeDialog, NativeDialogClose } from "@/components/ui/native-dialog";
import { cn } from "@/lib/utils";
import { settingsSections, type SettingsSectionId } from "@/components/system/setting/types";

function SettingsContent({ section }: { section: SettingsSectionId }) {
  if (section === "editor") return <EditorSettings />;
  if (section === "about") return <AboutSettings />;
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
        <div className="flex h-[min(70vh,620px)] min-h-0 min-w-0 flex-col overflow-hidden">
          <NativeDialogClose
            className="absolute inset-e-3 top-3 z-10"
            onClick={() => setOpen(false)}
          />
          <div className="flex min-h-0 min-w-0 flex-1  overflow-hidden flex-row">
            <aside className="border-b bg-muted md:w-64 md:shrink-0 md:border-b-0 md:border-r">
              <div className="max-h-60 overflow-y-auto will-change-transform [scrollbar-gutter:stable] md:h-full md:max-h-none">
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
                            : "text-muted-foreground hover:bg-accent hover:text-foreground",
                        )}
                        onClick={() => setActiveSection(section.id)}
                      >
                        <span
                          className={cn(
                            "mt-0.5 rounded-lg border p-2",
                            isActive
                              ? "border-primary/30 bg-primary/10 text-primary"
                              : "border-border bg-background text-muted-foreground",
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
              </div>
            </aside>
            <section className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-popover">
              <div className="min-h-0 flex-1 overflow-y-auto will-change-transform [scrollbar-gutter:stable]">
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
              </div>
            </section>
          </div>
        </div>
      </NativeDialog>
    </>
  );
}
