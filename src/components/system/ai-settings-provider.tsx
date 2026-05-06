import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";

type AiSettingsContextValue = {
  apiKey: string;
  enabled: boolean;
  setApiKey: (apiKey: string) => void;
  setEnabled: (enabled: boolean) => void;
};

const AI_COMPLETION_ENABLED_STORAGE_KEY = "madora-ai-completion-enabled";
const AI_COMPLETION_API_KEY_STORAGE_KEY = "madora-ai-completion-api-key";

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

export function AiSettingsProvider({ children }: { children: ReactNode }) {
  const [enabled, setEnabled] = useState<boolean>(getInitialEnabled);
  const [apiKey, setApiKey] = useState<string>(getInitialApiKey);

  useEffect(() => {
    window.localStorage.setItem(
      AI_COMPLETION_ENABLED_STORAGE_KEY,
      String(enabled),
    );
  }, [enabled]);

  useEffect(() => {
    window.localStorage.setItem(AI_COMPLETION_API_KEY_STORAGE_KEY, apiKey);
  }, [apiKey]);

  return (
    <AiSettingsContext.Provider
      value={{
        apiKey,
        enabled,
        setApiKey,
        setEnabled,
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
