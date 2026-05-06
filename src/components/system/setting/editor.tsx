import { Sparkles } from "lucide-react";
import { type ReactNode } from "react";

import { useAiSettings } from "@/components/system/ai-settings-provider";
import { Input } from "@/components/ui/input";
import { Kbd, KbdGroup } from "@/components/ui/kbd";
import { Switch } from "@/components/ui/switch";

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

export function EditorSettings() {
  const { apiKey, enabled, setApiKey, setEnabled } = useAiSettings();

  return (
    <div className="space-y-4">
      <SettingsSectionCard
        description="使用 DeepSeek FIM 为 Markdown 编辑器提供按 Tab 触发的行内补全。"
        title="AI 补全"
      >
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-4 rounded-xl border border-border/70 bg-background/70 px-4 py-3">
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                <Sparkles className="size-4" />
                启用 Tab AI 补全
              </div>
              <p className="text-xs text-muted-foreground">
                在编辑器中按
                <KbdGroup className="mx-1 align-middle">
                  <Kbd>Tab</Kbd>
                </KbdGroup>
                触发 FIM 补全；没有补全可用时仍保留原生缩进行为。
              </p>
            </div>
            <Switch checked={enabled} onCheckedChange={setEnabled} />
          </div>
          <label className="block space-y-2">
            <span className="text-sm font-medium text-foreground">DeepSeek API Key</span>
            <Input
              autoComplete="off"
              placeholder="sk-..."
              type="password"
              value={apiKey}
              onChange={(event) => setApiKey(event.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Key 仅保存在本机 localStorage，经 Tauri 后端代理请求 `https://api.deepseek.com/beta/completions`。
            </p>
          </label>
        </div>
      </SettingsSectionCard>
    </div>
  );
}
