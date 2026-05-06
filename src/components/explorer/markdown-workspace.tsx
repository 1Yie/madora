import { invoke } from "@tauri-apps/api/core";
import { useEffect, useRef, useState } from "react";

import { MarkdownEditor } from "./markdown-editor";

type SaveStatus = "idle" | "saving" | "saved" | "error";

type MarkdownWorkspaceProps = {
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

export function MarkdownWorkspace({ content, filePath }: MarkdownWorkspaceProps) {
  const [value, setValue] = useState(content);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const saveTimerRef = useRef<number | null>(null);
  const saveRequestIdRef = useRef(0);
  const lastSavedValueRef = useRef(content);

  useEffect(() => {
    if (saveTimerRef.current !== null) {
      window.clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }

    saveRequestIdRef.current += 1;
    lastSavedValueRef.current = content;
    setValue(content);
    setSaveError(null);
    setSaveStatus("idle");
  }, [content, filePath]);

  useEffect(() => {
    if (value === lastSavedValueRef.current) {
      return;
    }

    setSaveStatus("saving");
    setSaveError(null);

    if (saveTimerRef.current !== null) {
      window.clearTimeout(saveTimerRef.current);
    }

    const requestId = saveRequestIdRef.current + 1;
    saveRequestIdRef.current = requestId;

    saveTimerRef.current = window.setTimeout(() => {
      void invoke("write_workspace_file", {
        content: value,
        path: filePath,
      })
        .then(() => {
          if (saveRequestIdRef.current !== requestId) {
            return;
          }

          lastSavedValueRef.current = value;
          setSaveStatus("saved");
          setSaveError(null);
        })
        .catch((error) => {
          if (saveRequestIdRef.current !== requestId) {
            return;
          }

          setSaveStatus("error");
          setSaveError(getErrorMessage(error));
        });
    }, SAVE_DEBOUNCE_MS);

    return () => {
      if (saveTimerRef.current !== null) {
        window.clearTimeout(saveTimerRef.current);
        saveTimerRef.current = null;
      }
    };
  }, [filePath, value]);

  return (
    <MarkdownEditor
      onChange={setValue}
      saveError={saveError}
      saveStatus={saveStatus}
      value={value}
    />
  );
}
