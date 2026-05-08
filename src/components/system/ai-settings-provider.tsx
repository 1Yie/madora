import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

export type SaveMode = "auto" | "manual";
export type AiProvider = "anthropic" | "custom" | "deepseek" | "kimi" | "openai";

type ProviderConfig = {
  apiKey: string;
  apiUrl: string;
  model: string;
};

type AiSettingsContextValue = ProviderConfig & {
  enabled: boolean;
  provider: AiProvider;
  saveMode: SaveMode;
  showHiddenFiles: boolean;
  smartRoutingEnabled: boolean;
  setApiKey: (apiKey: string) => void;
  setApiUrl: (apiUrl: string) => void;
  setEnabled: (enabled: boolean) => void;
  setModel: (model: string) => void;
  setProvider: (provider: AiProvider) => void;
  setSaveMode: (saveMode: SaveMode) => void;
  setShowHiddenFiles: (showHiddenFiles: boolean) => void;
  setSmartRoutingEnabled: (smartRoutingEnabled: boolean) => void;
};

type ProviderDefinition = {
  description: string;
  defaultApiUrl: string;
  defaultModel: string;
  key: AiProvider;
  label: string;
};

const PROVIDERS: ProviderDefinition[] = [
  {
    description: "DeepSeek 官方接口。",
    defaultApiUrl: "https://api.deepseek.com",
    defaultModel: "deepseek-v4-pro",
    key: "deepseek",
    label: "DeepSeek",
  },
  {
    description: "OpenAI / ChatGPT 标准接口。",
    defaultApiUrl: "https://api.openai.com",
    defaultModel: "gpt-4o-mini",
    key: "openai",
    label: "OpenAI",
  },
  {
    description: "Anthropic Claude 接口。",
    defaultApiUrl: "https://api.anthropic.com",
    defaultModel: "claude-3-5-sonnet-latest",
    key: "anthropic",
    label: "Anthropic",
  },
  {
    description: "Kimi / Moonshot OpenAI 兼容接口。",
    defaultApiUrl: "https://api.moonshot.cn",
    defaultModel: "moonshot-v1-8k",
    key: "kimi",
    label: "Kimi",
  },
  {
    description: "自定义 OpenAI 兼容接口。",
    defaultApiUrl: "",
    defaultModel: "",
    key: "custom",
    label: "Custom",
  },
];

const DEFAULT_PROVIDER: AiProvider = "deepseek";
const AI_COMPLETION_ENABLED_STORAGE_KEY = "madora-ai-completion-enabled";
const AI_COMPLETION_PROVIDER_STORAGE_KEY = "madora-ai-provider";
const AI_COMPLETION_API_KEY_STORAGE_KEY = "madora-ai-completion-api-key";
const AI_COMPLETION_API_URL_STORAGE_KEY = "madora-ai-completion-api-url";
const AI_COMPLETION_MODEL_STORAGE_KEY = "madora-ai-completion-model";
const EDITOR_SAVE_MODE_STORAGE_KEY = "madora-editor-save-mode";
const EXPLORER_SHOW_HIDDEN_FILES_STORAGE_KEY = "madora-explorer-show-hidden-files";
const AI_COMPLETION_SMART_ROUTING_STORAGE_KEY = "madora-ai-completion-smart-routing-enabled";

const AiSettingsContext = createContext<AiSettingsContextValue | null>(null);

export function getProviderDefinitions() {
  return PROVIDERS;
}

function isProvider(value: string | null): value is AiProvider {
  return PROVIDERS.some((provider) => provider.key === value);
}

function getProviderDefinition(provider: AiProvider): ProviderDefinition {
  return PROVIDERS.find((item) => item.key === provider) ?? PROVIDERS[0];
}

function getProviderStorageKey(baseKey: string, provider: AiProvider) {
  return `${baseKey}:${provider}`;
}

function getStoredValue(key: string): string | null {
  if (typeof window === "undefined") {
    return null;
  }

  return window.localStorage.getItem(key);
}

function setStoredValue(key: string, value: string) {
  window.localStorage.setItem(key, value);
}

function getInitialEnabled(): boolean {
  const storedValue = getStoredValue(AI_COMPLETION_ENABLED_STORAGE_KEY);

  if (storedValue === null) {
    return true;
  }

  return storedValue === "true";
}

function getInitialProvider(): AiProvider {
  const storedValue = getStoredValue(AI_COMPLETION_PROVIDER_STORAGE_KEY);

  if (isProvider(storedValue)) {
    return storedValue;
  }

  return DEFAULT_PROVIDER;
}

function getInitialSmartRoutingEnabled(): boolean {
  const storedValue = getStoredValue(AI_COMPLETION_SMART_ROUTING_STORAGE_KEY);

  if (storedValue === null) {
    return false;
  }

  return storedValue === "true";
}

function getInitialSaveMode(): SaveMode {
  const storedValue = getStoredValue(EDITOR_SAVE_MODE_STORAGE_KEY);

  return storedValue === "manual" ? "manual" : "auto";
}

function getInitialShowHiddenFiles(): boolean {
  const storedValue = getStoredValue(EXPLORER_SHOW_HIDDEN_FILES_STORAGE_KEY);

  if (storedValue === null) {
    return false;
  }

  return storedValue === "true";
}

function getDefaultProviderConfig(provider: AiProvider): ProviderConfig {
  const definition = getProviderDefinition(provider);

  return {
    apiKey: "",
    apiUrl: definition.defaultApiUrl,
    model: definition.defaultModel,
  };
}

function readProviderConfig(provider: AiProvider): ProviderConfig {
  if (typeof window === "undefined") {
    return getDefaultProviderConfig(provider);
  }

  const defaultConfig = getDefaultProviderConfig(provider);

  return {
    apiKey:
      getStoredValue(getProviderStorageKey(AI_COMPLETION_API_KEY_STORAGE_KEY, provider)) ??
      defaultConfig.apiKey,
    apiUrl:
      getStoredValue(getProviderStorageKey(AI_COMPLETION_API_URL_STORAGE_KEY, provider)) ??
      defaultConfig.apiUrl,
    model:
      getStoredValue(getProviderStorageKey(AI_COMPLETION_MODEL_STORAGE_KEY, provider)) ??
      defaultConfig.model,
  };
}

function readInitialProviderConfigs(): Record<AiProvider, ProviderConfig> {
  return {
    anthropic: readProviderConfig("anthropic"),
    custom: readProviderConfig("custom"),
    deepseek: readProviderConfig("deepseek"),
    kimi: readProviderConfig("kimi"),
    openai: readProviderConfig("openai"),
  };
}

function migrateLegacyDeepSeekSettings() {
  if (typeof window === "undefined") {
    return;
  }

  const legacyApiKey = getStoredValue(AI_COMPLETION_API_KEY_STORAGE_KEY);
  const legacyApiUrl = getStoredValue(AI_COMPLETION_API_URL_STORAGE_KEY);
  const legacyModel = getStoredValue(AI_COMPLETION_MODEL_STORAGE_KEY);

  if (legacyApiKey !== null) {
    setStoredValue(getProviderStorageKey(AI_COMPLETION_API_KEY_STORAGE_KEY, "deepseek"), legacyApiKey);
    window.localStorage.removeItem(AI_COMPLETION_API_KEY_STORAGE_KEY);
  }

  if (legacyApiUrl !== null) {
    setStoredValue(getProviderStorageKey(AI_COMPLETION_API_URL_STORAGE_KEY, "deepseek"), legacyApiUrl);
    window.localStorage.removeItem(AI_COMPLETION_API_URL_STORAGE_KEY);
  }

  if (legacyModel !== null) {
    setStoredValue(getProviderStorageKey(AI_COMPLETION_MODEL_STORAGE_KEY, "deepseek"), legacyModel);
    window.localStorage.removeItem(AI_COMPLETION_MODEL_STORAGE_KEY);
  }
}

export function AiSettingsProvider({ children }: { children: ReactNode }) {
  const [enabled, setEnabled] = useState<boolean>(getInitialEnabled);
  const [provider, setProvider] = useState<AiProvider>(getInitialProvider);
  const [providerConfigs, setProviderConfigs] = useState<Record<AiProvider, ProviderConfig>>(
    readInitialProviderConfigs,
  );
  const [saveMode, setSaveMode] = useState<SaveMode>(getInitialSaveMode);
  const [showHiddenFiles, setShowHiddenFiles] = useState<boolean>(getInitialShowHiddenFiles);
  const [smartRoutingEnabled, setSmartRoutingEnabled] = useState<boolean>(
    getInitialSmartRoutingEnabled,
  );

  useEffect(() => {
    migrateLegacyDeepSeekSettings();
    setProviderConfigs(readInitialProviderConfigs());
  }, []);

  useEffect(() => {
    window.localStorage.setItem(AI_COMPLETION_ENABLED_STORAGE_KEY, String(enabled));
  }, [enabled]);

  useEffect(() => {
    window.localStorage.setItem(AI_COMPLETION_PROVIDER_STORAGE_KEY, provider);
  }, [provider]);

  useEffect(() => {
    for (const providerKey of Object.keys(providerConfigs) as AiProvider[]) {
      const config = providerConfigs[providerKey];
      window.localStorage.setItem(
        getProviderStorageKey(AI_COMPLETION_API_KEY_STORAGE_KEY, providerKey),
        config.apiKey,
      );
      window.localStorage.setItem(
        getProviderStorageKey(AI_COMPLETION_API_URL_STORAGE_KEY, providerKey),
        config.apiUrl,
      );
      window.localStorage.setItem(
        getProviderStorageKey(AI_COMPLETION_MODEL_STORAGE_KEY, providerKey),
        config.model,
      );
    }
  }, [providerConfigs]);

  useEffect(() => {
    window.localStorage.setItem(
      AI_COMPLETION_SMART_ROUTING_STORAGE_KEY,
      String(smartRoutingEnabled),
    );
  }, [smartRoutingEnabled]);

  useEffect(() => {
    window.localStorage.setItem(EDITOR_SAVE_MODE_STORAGE_KEY, saveMode);
  }, [saveMode]);

  useEffect(() => {
    window.localStorage.setItem(
      EXPLORER_SHOW_HIDDEN_FILES_STORAGE_KEY,
      String(showHiddenFiles),
    );
  }, [showHiddenFiles]);

  const currentConfig = providerConfigs[provider];

  const value = useMemo<AiSettingsContextValue>(
    () => ({
      apiKey: currentConfig.apiKey,
      apiUrl: currentConfig.apiUrl,
      enabled,
      model: currentConfig.model,
      provider,
      saveMode,
      showHiddenFiles,
      smartRoutingEnabled,
      setApiKey: (apiKey) => {
        setProviderConfigs((prev) => ({
          ...prev,
          [provider]: { ...prev[provider], apiKey },
        }));
      },
      setApiUrl: (apiUrl) => {
        setProviderConfigs((prev) => ({
          ...prev,
          [provider]: { ...prev[provider], apiUrl },
        }));
      },
      setEnabled,
      setModel: (model) => {
        setProviderConfigs((prev) => ({
          ...prev,
          [provider]: { ...prev[provider], model },
        }));
      },
      setProvider,
      setSaveMode,
      setShowHiddenFiles,
      setSmartRoutingEnabled,
    }),
    [
      currentConfig.apiKey,
      currentConfig.apiUrl,
      currentConfig.model,
      enabled,
      provider,
      saveMode,
      showHiddenFiles,
      smartRoutingEnabled,
    ],
  );

  return <AiSettingsContext.Provider value={value}>{children}</AiSettingsContext.Provider>;
}

export function useAiSettings() {
  const context = useContext(AiSettingsContext);

  if (!context) {
    throw new Error("useAiSettings must be used within AiSettingsProvider");
  }

  return context;
}
