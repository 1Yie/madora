import { useState, useEffect } from "react";
import type { SaveMode } from "@/components/system/ai-settings-provider";
import { useEditor } from "@/hooks/use-editor";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Spinner } from "@/components/ui/spinner";
import { Kbd, KbdGroup } from "@/components/ui/kbd";
import { explorerEditorStatusBarClassName } from "../layout";
import { MarkdownPreview } from "./markdown-preview";
import {
  ContextMenuPopup,
  ContextMenuRoot,
  ContextMenuTrigger,
  MenuItem,
  MenuSeparator,
} from "@/components/ui/context-menu";
import {
  Clipboard,
  Scissors,
  Copy,
  Bold,
  Italic,
  Strikethrough,
  Underline,
  Link,
  ImageIcon,
  PenLine,
  CircleCheck,
  CircleX,
  Save,
  CloudUpload,
} from "lucide-react";
import type { ReactNode } from "react";

type SaveStatus = "idle" | "dirty" | "saving" | "saved" | "error";

type MarkdownEditorProps = {
  encoding?: string | null;
  mode: "edit" | "preview";
  onChange: (value: string) => void;
  onSave: () => void;
  saveMode: SaveMode;
  saveStatus: SaveStatus;
  title?: string;
  value: string;
};

function isMac(): boolean {
  if ("userAgentData" in navigator) {
    return (
      (navigator as Navigator & { userAgentData: { platform: string } }).userAgentData.platform ===
      "macOS"
    );
  }
  return navigator.platform.toUpperCase().includes("MAC");
}

function getModKey(): string {
  return isMac() ? "Cmd" : "Ctrl";
}

function SaveShortcutHint(): ReactNode {
  return (
    <KbdGroup>
      <Kbd>{getModKey()}</Kbd>
      <Kbd>S</Kbd>
    </KbdGroup>
  );
}

function getSaveStatusNode(saveStatus: SaveStatus, saveMode: SaveMode): ReactNode {
  switch (saveStatus) {
    case "dirty":
      return (
        <span className="inline-flex items-center gap-1.5">
          <PenLine className="size-3.5 shrink-0" />
          未保存，按 <SaveShortcutHint /> 保存
        </span>
      );
    case "saving":
      return <span className="inline-flex items-center gap-1.5">正在保存...</span>;
    case "saved":
      return (
        <span className="inline-flex items-center gap-1.5 text-emerald-500">
          <CircleCheck className="size-3.5 shrink-0" />
          已保存
        </span>
      );
    case "error":
      return (
        <span className="inline-flex items-center gap-1.5 text-destructive">
          <CircleX className="size-3.5 shrink-0" />
          保存失败
        </span>
      );
    default:
      return saveMode === "manual" ? (
        <span className="inline-flex items-center gap-1.5">
          <Save className="size-3.5 shrink-0" />
          手动保存（
          <SaveShortcutHint />）
        </span>
      ) : (
        <span className="inline-flex items-center gap-1.5">
          <CloudUpload className="size-3.5 shrink-0" />
          编辑文本自动保存
        </span>
      );
  }
}

function wrapSelection(
  view: import("@codemirror/view").EditorView,
  before: string,
  after: string,
  placeholder?: string,
) {
  const { from, to } = view.state.selection.main;
  const selected = view.state.sliceDoc(from, to);
  const text = selected || placeholder || "";
  view.dispatch({
    changes: { from, to, insert: `${before}${text}${after}` },
    selection: { anchor: from + before.length, head: from + before.length + text.length },
  });
  view.focus();
}

export function MarkdownEditor({
  encoding,
  mode,
  onChange,
  onSave,
  saveMode,
  saveStatus,
  title,
  value,
}: MarkdownEditorProps) {
  const { editorRef, viewRef } = useEditor({ onChange, onSave, title, value });
  const characterCount = Array.from(value).length;
  const [gutterWidth, setGutterWidth] = useState(0);

  useEffect(() => {
    if (!editorRef.current) return;
    const getWidth = () => {
      const gutters = editorRef.current?.querySelector<HTMLElement>(".cm-gutters");
      if (gutters) setGutterWidth(gutters.getBoundingClientRect().width);
    };
    getWidth();
    const observer = new ResizeObserver(getWidth);
    const gutters = editorRef.current.querySelector<HTMLElement>(".cm-gutters");
    if (gutters) observer.observe(gutters);
    return () => observer.disconnect();
  }, []);

  const handleCut = () => {
    const view = viewRef.current;
    if (!view) return;
    const { from, to } = view.state.selection.main;
    const selection = view.state.sliceDoc(from, to);
    if (selection) {
      void navigator.clipboard.writeText(selection);
      view.dispatch({ changes: { from, to, insert: "" } });
    }
  };

  const handleCopy = () => {
    const view = viewRef.current;
    if (!view) return;
    const { from, to } = view.state.selection.main;
    const selection = view.state.sliceDoc(from, to);
    if (selection) void navigator.clipboard.writeText(selection);
  };

  const handlePaste = async () => {
    const view = viewRef.current;
    if (!view) return;
    const text = await navigator.clipboard.readText();
    const { from, to } = view.state.selection.main;
    view.dispatch({
      changes: { from, to, insert: text },
      selection: { anchor: from + text.length },
    });
    view.focus();
  };

  const handleBold = () => {
    const view = viewRef.current;
    if (!view) return;
    wrapSelection(view, "**", "**", "粗体文本");
  };

  const handleItalic = () => {
    const view = viewRef.current;
    if (!view) return;
    wrapSelection(view, "*", "*", "斜体文本");
  };

  const handleStrikethrough = () => {
    const view = viewRef.current;
    if (!view) return;
    wrapSelection(view, "~~", "~~", "删除线文本");
  };

  const handleUnderline = () => {
    const view = viewRef.current;
    if (!view) return;
    wrapSelection(view, "<u>", "</u>", "下划线文本");
  };

  const handleLink = () => {
    const view = viewRef.current;
    if (!view) return;
    const { from, to } = view.state.selection.main;
    const selected = view.state.sliceDoc(from, to);
    const text = selected || "链接文本";
    const insert = `[${text}](url)`;
    view.dispatch({
      changes: { from, to, insert },
      selection: { anchor: from + text.length + 3, head: from + insert.length - 1 },
    });
    view.focus();
  };

  const handleImage = () => {
    const view = viewRef.current;
    if (!view) return;
    const { from, to } = view.state.selection.main;
    const selected = view.state.sliceDoc(from, to);
    const alt = selected || "图片描述";
    const insert = `![${alt}](url)`;
    view.dispatch({
      changes: { from, to, insert },
      selection: { anchor: from + alt.length + 4, head: from + insert.length - 1 },
    });
    view.focus();
  };

  return (
    <div className="flex h-full min-h-72 flex-col overflow-hidden bg-[color-mix(in_oklab,var(--color-primary)_2%,transparent)]">
      <ContextMenuRoot>
        <ContextMenuTrigger className="relative min-h-0 flex-1" hidden={mode !== "edit"}>
          {gutterWidth > 0 && (
            <div
              className="absolute top-0 bottom-0 w-px bg-border pointer-events-none z-10"
              style={{ left: gutterWidth }}
            />
          )}
          <ScrollArea className="h-full">
            <div className="h-full" ref={editorRef} />
          </ScrollArea>
        </ContextMenuTrigger>
        <ContextMenuPopup align="start" sideOffset={6}>
          <MenuItem onClick={handleCut}>
            <Scissors />
            剪切
          </MenuItem>
          <MenuItem onClick={handleCopy}>
            <Copy />
            复制
          </MenuItem>
          <MenuItem onClick={() => void handlePaste()}>
            <Clipboard />
            粘贴
          </MenuItem>
          <MenuSeparator />
          <div className="flex items-center gap-0.5 px-1 py-0.5 select-none">
            {(
              [
                { icon: Bold, label: "加粗", action: handleBold },
                { icon: Italic, label: "斜体", action: handleItalic },
                { icon: Strikethrough, label: "删除线", action: handleStrikethrough },
                { icon: Underline, label: "下划线", action: handleUnderline },
                { icon: Link, label: "插入链接", action: handleLink },
                { icon: ImageIcon, label: "插入图片", action: handleImage },
              ] as const
            ).map(({ icon: Icon, label, action }) => (
              <button
                key={label}
                aria-label={label}
                className="flex size-7 items-center justify-center rounded-sm text-foreground/70 transition-colors hover:bg-accent hover:text-foreground"
                title={label}
                type="button"
                onClick={action}
              >
                <Icon className="size-3.5" />
              </button>
            ))}
          </div>
        </ContextMenuPopup>
      </ContextMenuRoot>
      {mode === "preview" ? <MarkdownPreview className="min-h-0 flex-1" content={value} /> : null}
      <div className={explorerEditorStatusBarClassName}>
        <div className="flex min-w-0 items-center gap-2 leading-none text-muted-foreground">
          {saveStatus === "saving" ? (
            <Spinner className="size-3.5 shrink-0 flex-none text-primary" />
          ) : null}
          <span className="truncate">{getSaveStatusNode(saveStatus, saveMode)}</span>
        </div>
        <div className="flex shrink-0 items-center gap-3 text-muted-foreground tabular-nums">
          <span>{characterCount} 字符</span>
          <span>{encoding ?? "-"}</span>
        </div>
      </div>
    </div>
  );
}
