import { indentWithTab } from "@codemirror/commands";
import { markdown } from "@codemirror/lang-markdown";
import {
  EditorSelection,
  EditorState,
  Prec,
  StateField,
  StateEffect,
} from "@codemirror/state";
import {
  EditorView,
  keymap,
  showTooltip,
  type Tooltip,
  type TooltipView,
  type ViewUpdate,
} from "@codemirror/view";
import { invoke } from "@tauri-apps/api/core";
import { basicSetup } from "codemirror";
import { Sparkles } from "lucide-react";
import { createRoot, type Root } from "react-dom/client";
import { useEffect, useEffectEvent, useRef } from "react";

import { useAiSettings } from "@/components/system/ai-settings-provider";
import { cn } from "@/lib/utils";

type UseEditorOptions = {
  onChange?: (value: string) => void;
  value: string;
};

type CompletionStatusTone = "muted" | "loading" | "success" | "error";

type CompletionStatus = {
  message: string;
  tone: CompletionStatusTone;
};

type CompletionTooltipState = {
  message: string;
  pos: number;
  tone: CompletionStatusTone;
};

const MAX_PREFIX_CHARS = 12_000;
const MAX_SUFFIX_CHARS = 4_000;

const setCompletionTooltipEffect = StateEffect.define<CompletionTooltipState | null>();

const completionTooltipField = StateField.define<CompletionTooltipState | null>({
  create() {
    return null;
  },
  update(value, transaction) {
    for (const effect of transaction.effects) {
      if (effect.is(setCompletionTooltipEffect)) {
        return effect.value;
      }
    }

    if (transaction.docChanged && value) {
      const cursor = transaction.state.selection.main.head;

      return {
        ...value,
        pos: cursor,
      };
    }

    return value;
  },
  provide: (field) =>
    showTooltip.compute([field], (state) => {
      const tooltipState = state.field(field);

      if (!tooltipState) {
        return null;
      }

      return {
        above: false,
        arrow: false,
        pos: tooltipState.pos,
        strictSide: true,
        create() {
          return createCompletionTooltipView(tooltipState);
        },
      } satisfies Tooltip;
    }),
});

const editorTheme = EditorView.theme(
  {
    "&": {
      height: "100%",
      backgroundColor: "transparent",
      color: "var(--color-foreground)",
      fontSize: "0.875rem",
    },
    ".cm-scroller": {
      fontFamily:
        '"Geist Variable", ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
      lineHeight: "1.7",
    },
    ".cm-content": {
      minHeight: "100%",
      padding: "1rem 1.25rem",
    },
    ".cm-line": {
      padding: "0",
    },
    ".cm-gutters": {
      minHeight: "100%",
      border: "none",
      backgroundColor: "transparent",
      color: "var(--color-muted-foreground)",
    },
    ".cm-activeLine": {
      backgroundColor: "color-mix(in oklab, var(--color-muted) 72%, transparent)",
    },
    ".cm-activeLineGutter": {
      backgroundColor: "transparent",
    },
    ".cm-cursor, .cm-dropCursor": {
      borderLeftColor: "var(--color-primary)",
    },
    ".cm-tooltip.cm-fim-tooltip": {
      border: "none",
      backgroundColor: "transparent",
      boxShadow: "none",
      padding: "0",
      maxWidth: "none",
    },
    "&.cm-focused": {
      outline: "none",
    },
  },
  {
    dark: true,
  },
);

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === "string") {
    return error;
  }

  return "AI 补全失败";
}

function getDefaultCompletionStatus(
  enabled: boolean,
  apiKey: string,
): CompletionStatus {
  if (!enabled) {
    return {
      message: "AI 补全已关闭",
      tone: "muted",
    };
  }

  if (apiKey.trim().length === 0) {
    return {
      message: "填写 DeepSeek API Key 后可用",
      tone: "muted",
    };
  }

  return {
    message: "按 Tab 触发 AI 补全",
    tone: "muted",
  };
}

function shouldTriggerCompletion(
  state: EditorState,
  enabled: boolean,
  apiKey: string,
): boolean {
  if (!enabled || apiKey.trim().length === 0) {
    return false;
  }

  if (state.selection.ranges.length !== 1 || !state.selection.main.empty) {
    return false;
  }

  const cursor = state.selection.main.head;
  const line = state.doc.lineAt(cursor);
  const linePrefix = state.doc.sliceString(line.from, cursor);

  return linePrefix.trim().length > 0;
}

function shouldShowCompletionTooltip(
  view: EditorView,
  status: CompletionStatus,
  enabled: boolean,
  apiKey: string,
): boolean {
  if (!view.hasFocus) {
    return false;
  }

  if (status.tone === "success") {
    return false;
  }

  if (status.tone === "error") {
    return true;
  }

  return shouldTriggerCompletion(view.state, enabled, apiKey);
}

function renderCompletionTooltip(
  view: EditorView,
  status: CompletionStatus,
  enabled: boolean,
  apiKey: string,
) {
  const nextTooltip = shouldShowCompletionTooltip(view, status, enabled, apiKey)
    ? {
        message: status.message,
        pos: view.state.selection.main.head,
        tone: status.tone,
      }
    : null;

  const currentTooltip = view.state.field(completionTooltipField);

  if (
    currentTooltip?.message === nextTooltip?.message &&
    currentTooltip?.pos === nextTooltip?.pos &&
    currentTooltip?.tone === nextTooltip?.tone
  ) {
    return;
  }

  view.dispatch({
    effects: setCompletionTooltipEffect.of(nextTooltip),
  });
}

function CompletionTooltipContent({ status }: { status: CompletionTooltipState }) {
  return (
    <div
      className={cn(
        "inline-flex items-center gap-3 rounded-full border px-4 py-2 text-sm shadow-lg backdrop-blur-sm",
        status.tone === "error" &&
          "border-destructive/20 bg-destructive/8 text-destructive",
        status.tone === "loading" &&
          "border-primary/20 bg-background/95 text-foreground",
        status.tone === "muted" &&
          "border-border/70 bg-background/95 text-foreground",
        status.tone === "success" &&
          "border-emerald-500/20 bg-background/95 text-emerald-600 dark:text-emerald-400",
      )}
    >
      <Sparkles
        className={cn(
          "size-4 shrink-0",
          status.tone === "error" && "text-destructive",
          status.tone === "loading" && "animate-pulse text-primary",
          status.tone === "muted" && "text-primary",
          status.tone === "success" && "text-emerald-600 dark:text-emerald-400",
        )}
      />
      <span className="whitespace-nowrap">{status.message}</span>
    </div>
  );
}

function createCompletionTooltipView(status: CompletionTooltipState): TooltipView {
  const dom = document.createElement("div");
  let root: Root | null = createRoot(dom);

  dom.className = "cm-fim-tooltip";
  dom.style.backgroundColor = "transparent";
  dom.style.border = "none";
  dom.style.boxShadow = "none";
  dom.style.padding = "0";
  root.render(<CompletionTooltipContent status={status} />);

  return {
    dom,
    offset: {
      x: 0,
      y: 12,
    },
    destroy() {
      root?.unmount();
      root = null;
    },
  };
}

export function useEditor({ onChange, value }: UseEditorOptions) {
  const editorRef = useRef<HTMLDivElement | null>(null);
  const viewRef = useRef<EditorView | null>(null);
  const requestIdRef = useRef(0);
  const aiSettingsRef = useRef({
    apiKey: "",
    enabled: true,
  });
  const completionStatusRef = useRef<CompletionStatus>({
    message: "填写 DeepSeek API Key 后可用",
    tone: "muted",
  });

  const { apiKey, enabled } = useAiSettings();

  const handleChange = useEffectEvent((nextValue: string) => {
    onChange?.(nextValue);
  });

  const syncTooltip = useEffectEvent(() => {
    const view = viewRef.current;

    if (!view) {
      return;
    }

    renderCompletionTooltip(
      view,
      completionStatusRef.current,
      aiSettingsRef.current.enabled,
      aiSettingsRef.current.apiKey,
    );
  });

  const setCompletionStatus = useEffectEvent((status: CompletionStatus) => {
    completionStatusRef.current = status;
    syncTooltip();
  });

  const requestCompletion = useEffectEvent(async (view: EditorView) => {
    const settings = aiSettingsRef.current;

    if (!shouldTriggerCompletion(view.state, settings.enabled, settings.apiKey)) {
      return;
    }

    const cursor = view.state.selection.main.head;
    const docText = view.state.doc.toString();
    const prompt = docText.slice(Math.max(0, cursor - MAX_PREFIX_CHARS), cursor);
    const suffix = docText.slice(cursor, cursor + MAX_SUFFIX_CHARS);
    const requestId = requestIdRef.current + 1;

    requestIdRef.current = requestId;
    setCompletionStatus({
      message: "正在生成 FIM 补全...",
      tone: "loading",
    });

    try {
      const completion = await invoke<string>("complete_fim", {
        apiKey: settings.apiKey,
        maxTokens: 128,
        prompt,
        suffix: suffix.length > 0 ? suffix : null,
      });

      if (requestId !== requestIdRef.current) {
        return;
      }

      const currentView = viewRef.current;

      if (!currentView) {
        return;
      }

      const currentState = currentView.state;

      if (
        currentState.doc.toString() !== docText ||
        currentState.selection.ranges.length !== 1 ||
        !currentState.selection.main.empty ||
        currentState.selection.main.head !== cursor
      ) {
        setCompletionStatus({
          message: "补全结果已过期，请重新按 Tab",
          tone: "muted",
        });
        return;
      }

      if (completion.length === 0) {
        setCompletionStatus({
          message: "按 Tab 触发 FIM 补全",
          tone: "muted",
        });
        return;
      }

      currentView.dispatch({
        changes: {
          from: cursor,
          insert: completion,
        },
        selection: EditorSelection.cursor(cursor + completion.length),
      });

      setCompletionStatus(getDefaultCompletionStatus(settings.enabled, settings.apiKey));
    } catch (error) {
      if (requestId !== requestIdRef.current) {
        return;
      }

      setCompletionStatus({
        message: getErrorMessage(error),
        tone: "error",
      });
    }
  });

  useEffect(() => {
    aiSettingsRef.current = {
      apiKey,
      enabled,
    };
    requestIdRef.current += 1;
    completionStatusRef.current = getDefaultCompletionStatus(enabled, apiKey);
    syncTooltip();
  }, [apiKey, enabled, syncTooltip]);

  useEffect(() => {
    if (!editorRef.current) {
      return;
    }

    completionStatusRef.current = getDefaultCompletionStatus(enabled, apiKey);

    const view = new EditorView({
      parent: editorRef.current,
      state: EditorState.create({
        doc: value,
        extensions: [
          basicSetup,
          markdown(),
          EditorView.lineWrapping,
          editorTheme,
          completionTooltipField,
          Prec.high(
            keymap.of([
              {
                key: "Tab",
                run: (activeView) => {
                  const settings = aiSettingsRef.current;

                  if (
                    !shouldTriggerCompletion(
                      activeView.state,
                      settings.enabled,
                      settings.apiKey,
                    )
                  ) {
                    return false;
                  }

                  void requestCompletion(activeView);
                  return true;
                },
              },
              indentWithTab,
            ]),
          ),
          EditorView.updateListener.of((update: ViewUpdate) => {
            if (update.docChanged) {
              handleChange(update.state.doc.toString());
            }

            if (
              update.docChanged ||
              update.selectionSet ||
              update.focusChanged ||
              update.viewportChanged
            ) {
              renderCompletionTooltip(
                update.view,
                completionStatusRef.current,
                aiSettingsRef.current.enabled,
                aiSettingsRef.current.apiKey,
              );
            }
          }),
        ],
      }),
    });

    viewRef.current = view;
    renderCompletionTooltip(view, completionStatusRef.current, enabled, apiKey);

    return () => {
      requestIdRef.current += 1;
      view.destroy();
      viewRef.current = null;
    };
  }, []);

  useEffect(() => {
    const view = viewRef.current;

    if (!view) {
      return;
    }

    const currentValue = view.state.doc.toString();

    if (currentValue === value) {
      return;
    }

    view.dispatch({
      changes: {
        from: 0,
        to: currentValue.length,
        insert: value,
      },
    });
  }, [value]);

  return {
    editorRef,
  };
}
