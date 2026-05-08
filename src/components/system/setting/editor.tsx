import { Sparkles } from "lucide-react";

import { useAiSettings } from "@/components/system/ai-settings-provider";
import { SettingsSectionCard } from "@/components/system/setting/shared";
import { Input } from "@/components/ui/input";
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
      <SettingsSectionCard description="配置编辑区域的相关功能" title="输入行为">
        <div className="flex items-center justify-between gap-4 rounded-xl border border-border bg-background px-4 py-3">
          <div className="space-y-1">
            <div className="text-sm font-medium text-foreground">自动保存</div>
            <p className="text-xs text-muted-foreground">开启后编辑内容会自动写入文件。</p>
          </div>
          <Switch
            checked={saveMode === "auto"}
            onCheckedChange={(checked) => setSaveMode(checked ? "auto" : "manual")}
          />
        </div>
      </SettingsSectionCard>
      <SettingsSectionCard description="配置 AI 相关功能" title="AI 补全">
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-4 rounded-xl border border-border bg-background px-4 py-3">
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                <Sparkles className="size-4" />
                启用 AI 自动补全
              </div>
              <p className="text-xs text-muted-foreground">开启后在输入时会自动向后补全文本。</p>
            </div>
            <Switch checked={enabled} onCheckedChange={setEnabled} />
          </div>
          <div className="flex items-center justify-between gap-4 rounded-xl border border-border bg-background px-4 py-3">
            <div className="space-y-1">
              <div className="text-sm font-medium text-foreground">启用智能路由</div>
              <p className="text-xs text-muted-foreground">自动模式始终优先走 FIM。</p>
              <p className="text-xs text-muted-foreground">
                开启后光标后方还有文本时走 FIM，否则走 chat-prefix。
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
            <p className="text-xs text-muted-foreground">模型地址。</p>
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
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">模型 API Key。</p>
              <p className="text-xs text-muted-foreground">
                API Key 仅保存在本机，通过后端请求使用。
              </p>
            </div>
          </label>
          <label className="block space-y-2">
            <span className="text-sm font-medium text-foreground">Model</span>
            <Input
              autoComplete="off"
              placeholder="deepseek-v4-pro"
              value={model}
              onChange={(event) => setModel(event.target.value)}
            />
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">模型名称。</p>
              <p className="text-xs text-muted-foreground">
                不同模型可能会有不同的功能和表现，具体请参考模型提供方的说明。
              </p>
            </div>
          </label>
        </div>
      </SettingsSectionCard>
    </div>
  );
}
