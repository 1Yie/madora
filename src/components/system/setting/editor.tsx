import { Sparkles, Check, Edit, X } from "lucide-react";
import { useEffect, useState } from "react";

import { getProviderDefinitions, useAiSettings } from "@/components/system/ai-settings-provider";
import { SettingsSectionCard, ThemeOption } from "@/components/system/setting/shared";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { InputGroup, InputGroupAddon } from "@/components/ui/input-group";
import { Switch } from "@/components/ui/switch";
import { showErrorToast, showSuccessToast } from "@/components/ui/toast";

export function EditorSettings() {
  const {
    apiUrl,
    deleteApiKey,
    enabled,
    hasApiKey,
    model,
    provider,
    saveApiKey,
    saveMode,
    showHiddenFiles,
    smartRoutingEnabled,
    setApiUrl,
    setEnabled,
    setModel,
    setProvider,
    setSaveMode,
    setShowHiddenFiles,
    setSmartRoutingEnabled,
  } = useAiSettings();
  const [apiKeyDraft, setApiKeyDraft] = useState("");
  const [, setApiKeyBusy] = useState(false);
  // savedAt stores the Date when the key was last saved (UI-only cache)
  const [, setSavedAt] = useState<Date | null>(null);
  // editing state: when true the input is editable and shows confirm/cancel
  const [isEditing, setIsEditing] = useState<boolean>(() => !hasApiKey);
  const selectedProvider = getProviderDefinitions().find((item) => item.key === provider);

  useEffect(() => {
    setApiKeyDraft("");
    if (!hasApiKey) setSavedAt(null);
    setIsEditing(!hasApiKey);
  }, [provider, hasApiKey]);

  const handleSaveApiKey = async () => {
    try {
      setApiKeyBusy(true);
      await saveApiKey(apiKeyDraft);
      setSavedAt(new Date());
      setApiKeyDraft("");
      setIsEditing(false);
      showSuccessToast("API Key 已保存到系统钥匙串");
    } catch (error) {
      showErrorToast("保存 API Key 失败", error instanceof Error ? error.message : String(error));
    } finally {
      setApiKeyBusy(false);
    }
  };

  const handleDeleteApiKey = async () => {
    try {
      setApiKeyBusy(true);
      await deleteApiKey();
      setApiKeyDraft("");
      setSavedAt(null);
      setIsEditing(false);
      showSuccessToast("已从系统钥匙串删除 API Key");
    } catch (error) {
      showErrorToast("删除 API Key 失败", error instanceof Error ? error.message : String(error));
    } finally {
      setApiKeyBusy(false);
    }
  };

  // Confirm handler used by the inline confirm button
  const handleConfirm = async () => {
    // If draft is empty and a key exists, interpret as delete.
    if (apiKeyDraft.trim().length === 0) {
      if (hasApiKey) {
        await handleDeleteApiKey();
      } else {
        // nothing to save
        setIsEditing(false);
      }

      return;
    }

    await handleSaveApiKey();
  };

  const handleCancel = () => {
    // discard draft and exit edit mode
    setApiKeyDraft("");
    setIsEditing(false);
  };

  // NOTE: savedAt/timeAgo are intentionally unused right now; keep helpers
  // in place for potential future UX improvements (timestamp badge).

  return (
    <div className="space-y-4">
      <SettingsSectionCard description="配置编辑区域的相关功能" title="输入行为">
        <div className="space-y-4">
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
          <div className="flex items-center justify-between gap-4 rounded-xl border border-border bg-background px-4 py-3">
            <div className="space-y-1">
              <div className="text-sm font-medium text-foreground">显示隐藏文件</div>
              <p className="text-xs text-muted-foreground">
                控制工作区侧栏是否显示以 <code>.</code> 开头的文件和目录。
              </p>
            </div>
            <Switch checked={showHiddenFiles} onCheckedChange={setShowHiddenFiles} />
          </div>
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
              当前配置会按 Provider 单独保存，切换后不会覆盖其他供应商的 Key 和模型。
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
            <p className="text-xs text-muted-foreground">当前 Provider 的接口地址。</p>
          </label>
          <label className="block space-y-2">
            <span className="text-sm font-medium text-foreground">API Key</span>
            <InputGroup>
              <Input
                autoComplete="off"
                placeholder={
                  apiKeyDraft ? "sk-..." : hasApiKey ? "已保存" : "sk-..."
                }
                type="password"
                value={apiKeyDraft}
                onChange={(event) => setApiKeyDraft(event.target.value)}
                aria-label="API Key"
                disabled={!isEditing}
              />
              <InputGroupAddon align="inline-end">
                {!isEditing ? (
                  <Button
                    size="icon-xs"
                    variant="ghost"
                    onClick={() => setIsEditing(true)}
                    aria-label="编辑 API Key"
                  >
                    <Edit />
                  </Button>
                ) : (
                  <div className="flex items-center gap-1">
                    <Button
                      size="icon-xs"
                      variant="ghost"
                      onClick={() => void handleConfirm()}
                      aria-label="确认保存"
                    >
                      <Check />
                    </Button>
                    <Button
                      size="icon-xs"
                      variant="ghost"
                      onClick={() => handleCancel()}
                      aria-label="取消编辑"
                    >
                      <X />
                    </Button>
                  </div>
                )}
              </InputGroupAddon>
            </InputGroup>
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">
                {hasApiKey
                  ? "当前 Provider 已保存 API Key。重新输入并保存可覆盖旧值。"
                  : "当前 Provider 尚未保存 API Key。"}
              </p>
              <p className="text-xs text-muted-foreground">
                API Key 存储在系统钥匙串中，不会上传云端，仅通过本机请求使用。
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
