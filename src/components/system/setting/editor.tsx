import { Sparkles } from "lucide-react";

import {
  getProviderDefinitions,
  useAiSettings,
} from "@/components/system/ai-settings-provider";
import { SettingsSectionCard, ThemeOption } from "@/components/system/setting/shared";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";

export function EditorSettings() {
  const {
    apiKey,
    apiUrl,
    enabled,
    model,
    provider,
    saveMode,
    smartRoutingEnabled,
    setApiKey,
    setApiUrl,
    setEnabled,
    setModel,
    setProvider,
    setSaveMode,
    setSmartRoutingEnabled,
  } = useAiSettings();
  const selectedProvider = getProviderDefinitions().find((item) => item.key === provider);

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
              <p className="text-xs text-muted-foreground">
                开启后光标后方还有文本时走 FIM，否则走 chat-prefix。
              </p>
            </div>
            <Switch checked={smartRoutingEnabled} onCheckedChange={setSmartRoutingEnabled} />
          </div>
          <div className="space-y-2">
            <span className="text-sm font-medium text-foreground">Provider</span>
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {getProviderDefinitions().map((item) => (
                <ThemeOption
                  key={item.key}
                  active={provider === item.key}
                  description={item.description}
                  label={item.label}
                  onClick={() => setProvider(item.key)}
                />
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              当前配置会按 provider 单独保存，切换后不会覆盖其他供应商的 Key 和模型。
            </p>
          </div>
          <label className="block space-y-2">
            <span className="text-sm font-medium text-foreground">API URL</span>
            <Input
              autoComplete="off"
              placeholder={selectedProvider?.defaultApiUrl || "https://api.example.com"}
              value={apiUrl}
              onChange={(event) => setApiUrl(event.target.value)}
            />
            <p className="text-xs text-muted-foreground">当前 provider 的接口地址。</p>
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
              <p className="text-xs text-muted-foreground">当前 provider 的 API Key。</p>
              <p className="text-xs text-muted-foreground">
                API Key 仅保存在本机，通过后端请求使用。
              </p>
            </div>
          </label>
          <label className="block space-y-2">
            <span className="text-sm font-medium text-foreground">Model</span>
            <Input
              autoComplete="off"
              placeholder={selectedProvider?.defaultModel || "model-name"}
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
