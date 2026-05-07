import { Sparkles } from "lucide-react";

import { useAiSettings } from "@/components/system/ai-settings-provider";
import { SettingsSectionCard } from "@/components/system/setting/shared";
import { Input } from "@/components/ui/input";
import { Kbd, KbdGroup } from "@/components/ui/kbd";
import { Switch } from "@/components/ui/switch";

export function EditorSettings() {
  const {
    apiKey,
    apiUrl,
    enabled,
    model,
    saveMode,
    smartRoutingEnabled,
    setApiKey,
    setApiUrl,
    setEnabled,
    setModel,
    setSaveMode,
    setSmartRoutingEnabled,
  } = useAiSettings();

  return (
    <div className="space-y-4">
      <SettingsSectionCard
        description="为 Markdown 编辑器选择默认保存方式。手动保存模式下，草稿仍会先保存在本地。"
        title="保存"
      >
        <div className="flex items-center justify-between gap-4 rounded-xl border border-border bg-background px-4 py-3">
          <div className="space-y-1">
            <div className="text-sm font-medium text-foreground">自动保存</div>
            <p className="text-xs text-muted-foreground">
              开启后编辑内容会自动写入文件；关闭后仅在按
              <span className="mx-1 font-medium text-foreground">Ctrl / Cmd + S</span>
              时保存。
            </p>
          </div>
          <Switch
            checked={saveMode === "auto"}
            onCheckedChange={(checked) => setSaveMode(checked ? "auto" : "manual")}
          />
        </div>
      </SettingsSectionCard>
      <SettingsSectionCard
        description="默认使用全局 FIM；你也可以开启智能路由，在需要时才回退到 chat-prefix。"
        title="AI 补全"
      >
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-4 rounded-xl border border-border bg-background px-4 py-3">
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                <Sparkles className="size-4" />
                启用 AI 自动补全
              </div>
              <p className="text-xs text-muted-foreground">
                输入后会自动请求并展示行内建议；有建议时按
                <KbdGroup className="mx-1 align-middle">
                  <Kbd>Tab</Kbd>
                </KbdGroup>
                接受补全；没有建议时仍保留原生缩进行为。
              </p>
            </div>
            <Switch checked={enabled} onCheckedChange={setEnabled} />
          </div>
          <div className="flex items-center justify-between gap-4 rounded-xl border border-border bg-background px-4 py-3">
            <div className="space-y-1">
              <div className="text-sm font-medium text-foreground">启用智能路由</div>
              <p className="text-xs text-muted-foreground">
                默认关闭，自动模式始终优先走 FIM。开启后才恢复当前逻辑：光标后方还有文本时走 FIM，否则走 chat-prefix。
              </p>
            </div>
            <Switch checked={smartRoutingEnabled} onCheckedChange={setSmartRoutingEnabled} />
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
            <p className="text-xs text-muted-foreground">Key 仅保存在本机。</p>
          </label>
          <label className="block space-y-2">
            <span className="text-sm font-medium text-foreground">Model</span>
            <Input
              autoComplete="off"
              placeholder="deepseek-v4-pro"
              value={model}
              onChange={(event) => setModel(event.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              这里控制 chat-prefix / FIM 请求共用的模型；chat-prefix 现在只会发送最近上下文以降低延迟。
            </p>
          </label>
        </div>
      </SettingsSectionCard>
    </div>
  );
}
