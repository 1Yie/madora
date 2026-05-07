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
  Decoration,
  EditorView,
  keymap,
  showTooltip,
  tooltips,
  WidgetType,
  type Tooltip,
  type TooltipView,
  type ViewUpdate,
} from "@codemirror/view";
import { invoke } from "@tauri-apps/api/core";
import { basicSetup } from "codemirror";
import { createRoot, type Root } from "react-dom/client";
import { useEffect, useEffectEvent, useRef } from "react";

import { useAiSettings } from "@/components/system/ai-settings-provider";
import { Spinner } from "@/components/ui/spinner";

type UseEditorOptions = {
  onChange?: (value: string) => void;
  title?: string;
  value: string;
};

type CompletionRequestMode = "auto" | "chat-prefix" | "fim";

type CompletionResultData = {
  mode: Exclude<CompletionRequestMode, "auto">;
  text: string;
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

type CompletionPreviewState = {
  pos: number;
  text: string;
};

const AUTO_COMPLETION_DEBOUNCE_MS = 300;
const MAX_PREFIX_CHARS = 12_000;
const MAX_SUFFIX_CHARS = 4_000;
const DEFAULT_READY_MESSAGE = "AI 自动补全已就绪";
const COMPLETION_TOOLTIP_EDGE_MARGIN = 12;

function getCompletionTooltipSpace(view: EditorView) {
  const rect = view.dom.getBoundingClientRect();

  return {
    bottom: rect.bottom,
    left: rect.left,
    right: rect.right,
    top: rect.top,
  };
}

function getCompletionTooltipShiftX(
  dom: HTMLElement,
  space: {
    left: number;
    right: number;
  },
): number {
  const rect = dom.getBoundingClientRect();
  const rightGap = space.right - rect.right;
  const leftGap = rect.left - space.left;

  if (rightGap >= COMPLETION_TOOLTIP_EDGE_MARGIN || leftGap <= 0) {
    return 0;
  }

  const shiftLeft = Math.min(COMPLETION_TOOLTIP_EDGE_MARGIN - rightGap, leftGap);

  return Math.round(-shiftLeft);
}

const setCompletionTooltipEffect = StateEffect.define<CompletionTooltipState | null>();
const setCompletionPreviewEffect = StateEffect.define<CompletionPreviewState | null>();

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
        strictSide: false,
        create() {
          return createCompletionTooltipView(tooltipState);
        },
      } satisfies Tooltip;
    }),
});

class CompletionPreviewWidget extends WidgetType {
  constructor(private readonly text: string) {
    super();
  }

  eq(other: CompletionPreviewWidget) {
    return other.text === this.text;
  }

  toDOM() {
    const dom = document.createElement("span");

    dom.className = "cm-fim-preview";
    dom.setAttribute("aria-hidden", "true");
    dom.textContent = this.text;

    return dom;
  }

  ignoreEvent() {
    return true;
  }
}

const completionPreviewField = StateField.define<CompletionPreviewState | null>({
  create() {
    return null;
  },
  update(value, transaction) {
    for (const effect of transaction.effects) {
      if (effect.is(setCompletionPreviewEffect)) {
        return effect.value;
      }
    }

    if (!value) {
      return null;
    }

    if (transaction.docChanged) {
      return null;
    }

    if (
      transaction.selection ||
      transaction.state.selection.ranges.length !== 1 ||
      !transaction.state.selection.main.empty ||
      transaction.state.selection.main.head !== value.pos
    ) {
      return null;
    }

    return value;
  },
  provide: (field) =>
    EditorView.decorations.compute([field], (state) => {
      const preview = state.field(field);

      if (!preview || preview.text.length === 0) {
        return Decoration.set([]);
      }

      return Decoration.set([
        Decoration.widget({
          side: 1,
          widget: new CompletionPreviewWidget(preview.text),
        }).range(preview.pos),
      ]);
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
    ".cm-fim-preview": {
      color: "var(--color-muted-foreground)",
      fontStyle: "italic",
      fontWeight: "100",
      opacity: "0.6",
      overflowWrap: "anywhere",
      pointerEvents: "none",
      userSelect: "none",
      verticalAlign: "top",
      whiteSpace: "pre-wrap",
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
      message: "填写 API Key 后可用",
      tone: "muted",
    };
  }

  return {
    message: DEFAULT_READY_MESSAGE,
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
  const prompt = state.doc.sliceString(Math.max(0, cursor - MAX_PREFIX_CHARS), cursor);

  return prompt.trim().length > 0;
}

function shouldShowCompletionTooltip(
  view: EditorView,
  status: CompletionStatus,
): boolean {
  return view.hasFocus && status.tone === "loading";
}

function renderCompletionTooltip(view: EditorView, status: CompletionStatus) {
  const nextTooltip = shouldShowCompletionTooltip(view, status)
    ? {
        message: "",
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

function renderCompletionPreview(
  view: EditorView,
  preview: CompletionPreviewState | null,
) {
  const currentPreview = view.state.field(completionPreviewField);

  if (
    currentPreview?.pos === preview?.pos &&
    currentPreview?.text === preview?.text
  ) {
    return;
  }

  view.dispatch({
    effects: setCompletionPreviewEffect.of(preview),
  });
}

function CompletionTooltipContent() {
  return (
    <div className="inline-flex items-center justify-center rounded-full border border-border/60 bg-background/90 p-1 shadow-sm backdrop-blur-sm">
      <Spinner className="size-3 text-primary/85" />
    </div>
  );
}

function createCompletionTooltipView(_status: CompletionTooltipState): TooltipView {
  const dom = document.createElement("div");
  let root: Root | null = createRoot(dom);
  let currentShiftX = 0;

  dom.className = "cm-fim-tooltip";
  dom.style.backgroundColor = "transparent";
  dom.style.border = "none";
  dom.style.boxShadow = "none";
  dom.style.padding = "0";
  root.render(<CompletionTooltipContent />);

  return {
    dom,
    offset: {
      x: 0,
      y: 8,
    },
    positioned(space) {
      if (currentShiftX !== 0) {
        dom.style.transform = "";
      }

      currentShiftX = getCompletionTooltipShiftX(dom, space);
      dom.style.transform = currentShiftX === 0 ? "" : `translateX(${currentShiftX}px)`;
    },
    destroy() {
      root?.unmount();
      root = null;
    },
  };
}

export function useEditor({ onChange, title, value }: UseEditorOptions) {
  const autoCompletionTimerRef = useRef<number | null>(null);
  const editorRef = useRef<HTMLDivElement | null>(null);
  const viewRef = useRef<EditorView | null>(null);
  const requestIdRef = useRef(0);
  const aiSettingsRef = useRef({
    apiKey: "",
    apiUrl: "",
    enabled: true,
    fimEnabled: true,
    model: "",
  });
  const completionStatusRef = useRef<CompletionStatus>({
    message: "填写 API Key 后可用",
    tone: "muted",
  });

  const { apiKey, apiUrl, enabled, fimEnabled, model } = useAiSettings();

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
    );
  });

  const setCompletionStatus = useEffectEvent((status: CompletionStatus) => {
    completionStatusRef.current = status;
    syncTooltip();
  });

  const syncPreview = useEffectEvent((preview: CompletionPreviewState | null) => {
    const view = viewRef.current;

    if (!view) {
      return;
    }

    renderCompletionPreview(view, preview);
  });

  const clearScheduledCompletion = useEffectEvent(() => {
    if (autoCompletionTimerRef.current === null) {
      return;
    }

    window.clearTimeout(autoCompletionTimerRef.current);
    autoCompletionTimerRef.current = null;
  });

  const clearCompletionPreview = useEffectEvent(() => {
    syncPreview(null);
  });

  const requestCompletion = useEffectEvent(async (view: EditorView) => {
      const settings = aiSettingsRef.current;

      if (!shouldTriggerCompletion(view.state, settings.enabled, settings.apiKey)) {
        return;
      }

      const currentPreview = view.state.field(completionPreviewField);

      if (currentPreview?.pos === view.state.selection.main.head) {
        return;
      }

      const cursor = view.state.selection.main.head;
      const docText = view.state.doc.toString();
      const prompt = docText.slice(Math.max(0, cursor - MAX_PREFIX_CHARS), cursor);
      const suffix = docText.slice(cursor, cursor + MAX_SUFFIX_CHARS);
      const requestId = requestIdRef.current + 1;

      requestIdRef.current = requestId;
      clearScheduledCompletion();
      clearCompletionPreview();

      setCompletionStatus({
        message: "正在生成 AI 建议...",
        tone: "loading",
      });

      try {
        const result = await invoke<CompletionResultData>("generate_completion", {
          config: {
            apiKey: settings.apiKey,
            apiUrl: settings.apiUrl.trim().length > 0 ? settings.apiUrl : null,
            fimEnabled: settings.fimEnabled,
            model: settings.model.trim().length > 0 ? settings.model : null,
          },
          request: {
            mode: "auto",
            prefix: prompt,
            suffix: suffix.length > 0 ? suffix : null,
            title: title ?? null,
          },
        });
        const completion = result.text;

        if (requestId !== requestIdRef.current) {
          return;
        }

        const currentView = viewRef.current;

        if (!currentView || !currentView.hasFocus) {
          return;
        }

        const currentState = currentView.state;

        if (
          currentState.doc.toString() !== docText ||
          currentState.selection.ranges.length !== 1 ||
          !currentState.selection.main.empty ||
          currentState.selection.main.head !== cursor
        ) {
          return;
        }

        if (completion.length === 0) {
          clearCompletionPreview();
          setCompletionStatus(getDefaultCompletionStatus(settings.enabled, settings.apiKey));
          return;
        }

        renderCompletionPreview(currentView, {
          pos: cursor,
          text: completion,
        });

        setCompletionStatus(getDefaultCompletionStatus(settings.enabled, settings.apiKey));
      } catch (error) {
        if (requestId !== requestIdRef.current) {
          return;
        }

        clearCompletionPreview();
        setCompletionStatus({
          message: getErrorMessage(error),
          tone: "error",
        });
      }
  });

  const scheduleCompletionRequest = useEffectEvent((view: EditorView) => {
    clearScheduledCompletion();

    const settings = aiSettingsRef.current;

    if (
      !view.hasFocus ||
      !shouldTriggerCompletion(view.state, settings.enabled, settings.apiKey) ||
      view.state.field(completionPreviewField)
    ) {
      return;
    }

    autoCompletionTimerRef.current = window.setTimeout(() => {
      autoCompletionTimerRef.current = null;
      void requestCompletion(view);
    }, AUTO_COMPLETION_DEBOUNCE_MS);
  });

  const acceptCompletionPreview = useEffectEvent((view: EditorView) => {
    const preview = view.state.field(completionPreviewField);
    const cursor = view.state.selection.main.head;

    if (!preview || preview.pos !== cursor || preview.text.length === 0) {
      return false;
    }

    clearScheduledCompletion();
    view.dispatch({
      changes: {
        from: cursor,
        insert: preview.text,
      },
      effects: setCompletionPreviewEffect.of(null),
      selection: EditorSelection.cursor(cursor + preview.text.length),
    });
    setCompletionStatus(
      getDefaultCompletionStatus(
        aiSettingsRef.current.enabled,
        aiSettingsRef.current.apiKey,
      ),
    );

    return true;
  });

  useEffect(() => {
    aiSettingsRef.current = {
      apiKey,
      apiUrl,
      enabled,
      fimEnabled,
      model,
    };
    clearScheduledCompletion();
    requestIdRef.current += 1;
    clearCompletionPreview();
    completionStatusRef.current = getDefaultCompletionStatus(enabled, apiKey);
    syncTooltip();
  }, [
    apiKey,
    apiUrl,
    clearCompletionPreview,
    clearScheduledCompletion,
    enabled,
    fimEnabled,
    model,
    syncTooltip,
  ]);

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
          tooltips({
            tooltipSpace: getCompletionTooltipSpace,
          }),
          editorTheme,
          completionPreviewField,
          completionTooltipField,
          Prec.high(
            keymap.of([
              {
                key: "Tab",
                run: (activeView) => {
                  return acceptCompletionPreview(activeView);
                },
              },
              indentWithTab,
            ]),
          ),
          EditorView.updateListener.of((update: ViewUpdate) => {
            if (update.docChanged) {
              handleChange(update.state.doc.toString());
            }

            if (update.docChanged || update.selectionSet) {
              requestIdRef.current += 1;

              if (
                completionStatusRef.current.tone === "error" ||
                completionStatusRef.current.tone === "loading"
              ) {
                completionStatusRef.current = getDefaultCompletionStatus(
                  aiSettingsRef.current.enabled,
                  aiSettingsRef.current.apiKey,
                );
              }
            }

            if (update.focusChanged && !update.view.hasFocus) {
              clearScheduledCompletion();
              clearCompletionPreview();
              completionStatusRef.current = getDefaultCompletionStatus(
                aiSettingsRef.current.enabled,
                aiSettingsRef.current.apiKey,
              );
            }

            if (
              update.docChanged ||
              update.selectionSet ||
              (update.focusChanged && update.view.hasFocus)
            ) {
              scheduleCompletionRequest(update.view);
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
              );
            }
          }),
        ],
      }),
    });

    viewRef.current = view;
    renderCompletionTooltip(view, completionStatusRef.current);

    return () => {
      requestIdRef.current += 1;

      if (autoCompletionTimerRef.current !== null) {
        window.clearTimeout(autoCompletionTimerRef.current);
        autoCompletionTimerRef.current = null;
      }

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
