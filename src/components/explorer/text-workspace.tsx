import { invoke } from "@tauri-apps/api/core";
import { useEffect, useEffectEvent, useRef, useState } from "react";

import { useAiSettings } from "@/components/system/ai-settings-provider";
import { showErrorToast } from "@/components/ui/toast";

import { MarkdownEditor } from "./markdown-editor";

type SaveStatus = "idle" | "dirty" | "saving" | "saved" | "error";

type TextWorkspaceProps = {
  content: string;
  filePath: string;
};

const SAVE_DEBOUNCE_MS = 400;

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === "string") {
    return error;
  }

  return "保存失败";
}

export function TextWorkspace({ content, filePath }: TextWorkspaceProps) {
  const { saveMode } = useAiSettings();
  const [value, setValue] = useState(content);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const saveTimerRef = useRef<number | null>(null);
  const saveRequestIdRef = useRef(0);
  const lastSavedValueRef = useRef(content);
  const syncingFromPropsRef = useRef(false);

  const fileName = filePath.replace(/\\/g, "/").split("/").pop() ?? "file";

  useEffect(() => {
    saveRequestIdRef.current += 1;
    lastSavedValueRef.current = content;
    syncingFromPropsRef.current = true;
    setValue(content);
    setSaveError(null);
    setSaveStatus("idle");
  }, [content, filePath]);

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
      setSaveStatus("saved");
      setSaveError(null);
      window.dispatchEvent(
        new CustomEvent("workspace-file-saved", {
          detail: { filePath },
        }),
      );
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
    setSaveStatus(
      value === lastSavedValueRef.current ? "idle" : saveMode === "manual" ? "dirty" : "idle",
    );
  }, [saveError, saveMode, value]);

  return (
    <MarkdownEditor
      onChange={setValue}
      onSave={handleSave}
      saveMode={saveMode}
      saveStatus={saveStatus}
      title={fileName}
      value={value} mode={"edit"}    />
  );
}
