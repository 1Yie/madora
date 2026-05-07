import { invoke } from "@tauri-apps/api/core";
import { useEffect, useEffectEvent, useRef, useState } from "react";

import { useAiSettings } from "@/components/system/ai-settings-provider";
import { showErrorToast } from "@/components/ui/toast";

import { MarkdownEditor } from "./markdown-editor";

type SaveStatus = "idle" | "dirty" | "saving" | "saved" | "error";

type MarkdownWorkspaceProps = {
  content: string;
  filePath: string;
};

const DRAFT_STORAGE_KEY_PREFIX = "madora-markdown-draft:";
const SAVE_DEBOUNCE_MS = 400;

function getDraftStorageKey(filePath: string): string {
  return `${DRAFT_STORAGE_KEY_PREFIX}${filePath}`;
}

function getInitialValue(filePath: string, content: string): string {
  const draft = window.localStorage.getItem(getDraftStorageKey(filePath));

  return draft ?? content;
}

function getFileTitle(filePath: string): string {
  const normalizedPath = filePath.replace(/\\/g, "/");
  const fileName = normalizedPath.split("/").pop() ?? "Untitled";

  return fileName.replace(/\.(md|markdown|mdx)$/i, "");
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === "string") {
    return error;
  }

  return "保存失败";
}

export function MarkdownWorkspace({ content, filePath }: MarkdownWorkspaceProps) {
  const { saveMode } = useAiSettings();
  const [value, setValue] = useState(() => getInitialValue(filePath, content));
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const saveTimerRef = useRef<number | null>(null);
  const saveRequestIdRef = useRef(0);
  const lastSavedValueRef = useRef(getInitialValue(filePath, content));
  const syncingFromPropsRef = useRef(false);

  useEffect(() => {
    if (saveTimerRef.current !== null) {
      window.clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }

    saveRequestIdRef.current += 1;
    const nextValue = getInitialValue(filePath, content);

    lastSavedValueRef.current = nextValue;
    syncingFromPropsRef.current = true;
    setValue(nextValue);
    setSaveError(null);
    setSaveStatus("idle");
  }, [content, filePath]);

  useEffect(() => {
    window.localStorage.setItem(getDraftStorageKey(filePath), value);
  }, [filePath, value]);

  const persistValue = useEffectEvent(async (nextValue: string, requestId: number) => {
    try {
      await invoke("write_workspace_file", {
        content: nextValue,
        path: filePath,
      });

      if (saveRequestIdRef.current !== requestId) {
        return;
      }

      lastSavedValueRef.current = nextValue;
      window.localStorage.removeItem(getDraftStorageKey(filePath));
      setSaveStatus("saved");
      setSaveError(null);
    } catch (error) {
      if (saveRequestIdRef.current !== requestId) {
        return;
      }

      setSaveStatus("error");
      setSaveError(getErrorMessage(error));
    }
  });

  const requestSave = useEffectEvent((nextValue: string, immediate = false) => {
    if (saveTimerRef.current !== null) {
      window.clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }

    if (nextValue === lastSavedValueRef.current) {
      setSaveStatus("saved");
      setSaveError(null);
      return;
    }

    const requestId = saveRequestIdRef.current + 1;
    saveRequestIdRef.current = requestId;
    setSaveStatus("saving");
    setSaveError(null);

    if (immediate) {
      void persistValue(nextValue, requestId);
      return;
    }

    saveTimerRef.current = window.setTimeout(() => {
      saveTimerRef.current = null;
      void persistValue(nextValue, requestId);
    }, SAVE_DEBOUNCE_MS);
  });

  const handleSave = useEffectEvent(() => {
    requestSave(value, true);
  });

  useEffect(() => {
    if (syncingFromPropsRef.current) {
      syncingFromPropsRef.current = false;
      return;
    }

    if (value === lastSavedValueRef.current) {
      return;
    }

    if (saveMode === "manual") {
      if (saveTimerRef.current !== null) {
        window.clearTimeout(saveTimerRef.current);
        saveTimerRef.current = null;
      }

      setSaveStatus("dirty");
      setSaveError(null);
      return;
    }

    requestSave(value);

    return () => {
      if (saveTimerRef.current !== null) {
        window.clearTimeout(saveTimerRef.current);
        saveTimerRef.current = null;
      }
    };
  }, [filePath, requestSave, saveMode, value]);

  useEffect(() => {
    if (!saveError) {
      return;
    }

    showErrorToast("保存失败", saveError);
    setSaveError(null);
    setSaveStatus(value === lastSavedValueRef.current ? "idle" : saveMode === "manual" ? "dirty" : "idle");
  }, [saveError, saveMode, value]);

  return (
    <MarkdownEditor
      onChange={setValue}
      onSave={handleSave}
      saveMode={saveMode}
      saveStatus={saveStatus}
      title={getFileTitle(filePath)}
      value={value}
    />
  );
}
