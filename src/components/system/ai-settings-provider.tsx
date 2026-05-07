import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";

export type SaveMode = "auto" | "manual";

type AiSettingsContextValue = {
  apiKey: string;
  apiUrl: string;
  enabled: boolean;
  model: string;
  saveMode: SaveMode;
  smartRoutingEnabled: boolean;
  setApiKey: (apiKey: string) => void;
  setApiUrl: (apiUrl: string) => void;
  setEnabled: (enabled: boolean) => void;
  setModel: (model: string) => void;
  setSaveMode: (saveMode: SaveMode) => void;
  setSmartRoutingEnabled: (smartRoutingEnabled: boolean) => void;
};

const DEFAULT_AI_API_URL = "https://api.deepseek.com";
const DEFAULT_AI_MODEL = "deepseek-v4-pro";
const AI_COMPLETION_ENABLED_STORAGE_KEY = "madora-ai-completion-enabled";
const AI_COMPLETION_API_KEY_STORAGE_KEY = "madora-ai-completion-api-key";
const AI_COMPLETION_API_URL_STORAGE_KEY = "madora-ai-completion-api-url";
const AI_COMPLETION_MODEL_STORAGE_KEY = "madora-ai-completion-model";
const EDITOR_SAVE_MODE_STORAGE_KEY = "madora-editor-save-mode";
const AI_COMPLETION_SMART_ROUTING_STORAGE_KEY = "madora-ai-completion-smart-routing-enabled";

const AiSettingsContext = createContext<AiSettingsContextValue | null>(null);

function getInitialEnabled(): boolean {
  if (typeof window === "undefined") {
    return true;
  }

  const storedValue = window.localStorage.getItem(
    AI_COMPLETION_ENABLED_STORAGE_KEY,
  );

  if (storedValue === null) {
    return true;
  }

  return storedValue === "true";
}

function getInitialApiKey(): string {
  if (typeof window === "undefined") {
    return "";
  }

  return window.localStorage.getItem(AI_COMPLETION_API_KEY_STORAGE_KEY) ?? "";
}

function getInitialApiUrl(): string {
  if (typeof window === "undefined") {
    return DEFAULT_AI_API_URL;
  }

  return window.localStorage.getItem(AI_COMPLETION_API_URL_STORAGE_KEY) ?? DEFAULT_AI_API_URL;
}

function getInitialSmartRoutingEnabled(): boolean {
  if (typeof window === "undefined") {
    return false;
  }

  const storedValue = window.localStorage.getItem(
    AI_COMPLETION_SMART_ROUTING_STORAGE_KEY,
  );

  if (storedValue === null) {
    return false;
  }

  return storedValue === "true";
}

function getInitialModel(): string {
  if (typeof window === "undefined") {
    return DEFAULT_AI_MODEL;
  }

  return window.localStorage.getItem(AI_COMPLETION_MODEL_STORAGE_KEY) ?? DEFAULT_AI_MODEL;
}

function getInitialSaveMode(): SaveMode {
  if (typeof window === "undefined") {
    return "auto";
  }

  const storedValue = window.localStorage.getItem(EDITOR_SAVE_MODE_STORAGE_KEY);

  return storedValue === "manual" ? "manual" : "auto";
}

export function AiSettingsProvider({ children }: { children: ReactNode }) {
  const [enabled, setEnabled] = useState<boolean>(getInitialEnabled);
  const [apiKey, setApiKey] = useState<string>(getInitialApiKey);
  const [apiUrl, setApiUrl] = useState<string>(getInitialApiUrl);
  const [model, setModel] = useState<string>(getInitialModel);
  const [saveMode, setSaveMode] = useState<SaveMode>(getInitialSaveMode);
  const [smartRoutingEnabled, setSmartRoutingEnabled] = useState<boolean>(
    getInitialSmartRoutingEnabled,
  );

  useEffect(() => {
    window.localStorage.setItem(
      AI_COMPLETION_ENABLED_STORAGE_KEY,
      String(enabled),
    );
  }, [enabled]);

  useEffect(() => {
    window.localStorage.setItem(AI_COMPLETION_API_KEY_STORAGE_KEY, apiKey);
  }, [apiKey]);

  useEffect(() => {
    window.localStorage.setItem(AI_COMPLETION_API_URL_STORAGE_KEY, apiUrl);
  }, [apiUrl]);

  useEffect(() => {
    window.localStorage.setItem(
      AI_COMPLETION_SMART_ROUTING_STORAGE_KEY,
      String(smartRoutingEnabled),
    );
  }, [smartRoutingEnabled]);

  useEffect(() => {
    window.localStorage.setItem(AI_COMPLETION_MODEL_STORAGE_KEY, model);
  }, [model]);

  useEffect(() => {
    window.localStorage.setItem(EDITOR_SAVE_MODE_STORAGE_KEY, saveMode);
  }, [saveMode]);

  return (
    <AiSettingsContext.Provider
      value={{
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
      }}
    >
      {children}
    </AiSettingsContext.Provider>
  );
}

export function useAiSettings() {
  const context = useContext(AiSettingsContext);

  if (!context) {
    throw new Error("useAiSettings must be used within AiSettingsProvider");
  }

  return context;
}
