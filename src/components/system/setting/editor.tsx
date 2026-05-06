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
  const {
    apiKey,
    apiUrl,
    enabled,
    fimEnabled,
    model,
    setApiKey,
    setApiUrl,
    setEnabled,
    setFimEnabled,
    setModel,
  } = useAiSettings();

  return (
    <div className="space-y-4">
      <SettingsSectionCard
        description="使用固定的 chat-prefix / FIM 策略为 Markdown 编辑器提供按 Tab 触发的行内补全。"
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
          <div className="flex items-center justify-between gap-4 rounded-xl border border-border/70 bg-background/70 px-4 py-3">
            <div className="space-y-1">
              <div className="text-sm font-medium text-foreground">自动模式启用 FIM</div>
              <p className="text-xs text-muted-foreground">
                开启后，光标后方还有文本时优先走 FIM；否则自动回退到 chat-prefix。
              </p>
            </div>
            <Switch checked={fimEnabled} onCheckedChange={setFimEnabled} />
          </div>
          <label className="block space-y-2">
            <span className="text-sm font-medium text-foreground">API URL</span>
            <Input
              autoComplete="off"
              placeholder="https://api.deepseek.com"
              value={apiUrl}
              onChange={(event) => setApiUrl(event.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              使用基础地址；后端会自动补齐 Beta 路径并请求 `/chat/completions` 或 `/completions`。
            </p>
          </label>
          <label className="block space-y-2">
            <span className="text-sm font-medium text-foreground">API Key</span>
            <Input
              autoComplete="off"
              placeholder="sk-..."
              type="password"
              value={apiKey}
              onChange={(event) => setApiKey(event.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Key 仅保存在本机。
            </p>
          </label>
          <label className="block space-y-2">
            <span className="text-sm font-medium text-foreground">模型</span>
            <Input
              autoComplete="off"
              placeholder="deepseek-v4-pro"
              value={model}
              onChange={(event) => setModel(event.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              这里控制 chat-prefix / FIM 请求共用的模型；你可以按接口能力切换。
            </p>
          </label>
        </div>
      </SettingsSectionCard>
    </div>
  );
}
