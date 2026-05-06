import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";

type AiSettingsContextValue = {
  apiKey: string;
  apiUrl: string;
  enabled: boolean;
  fimEnabled: boolean;
  model: string;
  setApiKey: (apiKey: string) => void;
  setApiUrl: (apiUrl: string) => void;
  setEnabled: (enabled: boolean) => void;
  setFimEnabled: (fimEnabled: boolean) => void;
  setModel: (model: string) => void;
};

const DEFAULT_AI_API_URL = "https://api.deepseek.com";
const DEFAULT_AI_MODEL = "deepseek-v4-pro";
const AI_COMPLETION_ENABLED_STORAGE_KEY = "madora-ai-completion-enabled";
const AI_COMPLETION_API_KEY_STORAGE_KEY = "madora-ai-completion-api-key";
const AI_COMPLETION_API_URL_STORAGE_KEY = "madora-ai-completion-api-url";
const AI_COMPLETION_FIM_ENABLED_STORAGE_KEY = "madora-ai-completion-fim-enabled";
const AI_COMPLETION_MODEL_STORAGE_KEY = "madora-ai-completion-model";

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

function getInitialFimEnabled(): boolean {
  if (typeof window === "undefined") {
    return true;
  }

  const storedValue = window.localStorage.getItem(
    AI_COMPLETION_FIM_ENABLED_STORAGE_KEY,
  );

  if (storedValue === null) {
    return true;
  }

  return storedValue === "true";
}

function getInitialModel(): string {
  if (typeof window === "undefined") {
    return DEFAULT_AI_MODEL;
  }

  return window.localStorage.getItem(AI_COMPLETION_MODEL_STORAGE_KEY) ?? DEFAULT_AI_MODEL;
}

export function AiSettingsProvider({ children }: { children: ReactNode }) {
  const [enabled, setEnabled] = useState<boolean>(getInitialEnabled);
  const [apiKey, setApiKey] = useState<string>(getInitialApiKey);
  const [apiUrl, setApiUrl] = useState<string>(getInitialApiUrl);
  const [fimEnabled, setFimEnabled] = useState<boolean>(getInitialFimEnabled);
  const [model, setModel] = useState<string>(getInitialModel);

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
      AI_COMPLETION_FIM_ENABLED_STORAGE_KEY,
      String(fimEnabled),
    );
  }, [fimEnabled]);

  useEffect(() => {
    window.localStorage.setItem(AI_COMPLETION_MODEL_STORAGE_KEY, model);
  }, [model]);

  return (
    <AiSettingsContext.Provider
      value={{
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
