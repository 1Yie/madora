import type { SaveMode } from "@/components/system/ai-settings-provider";
import { useEditor } from "@/hooks/use-editor";
import { Spinner } from "@/components/ui/spinner";

type SaveStatus = "idle" | "dirty" | "saving" | "saved" | "error";

type MarkdownEditorProps = {
  onChange: (value: string) => void;
  onSave: () => void;
  saveMode: SaveMode;
  saveStatus: SaveStatus;
  title?: string;
  value: string;
};

function getSaveStatusText(saveStatus: SaveStatus, saveMode: SaveMode): string {
  switch (saveStatus) {
    case "dirty":
      return "未保存，按 Ctrl / Cmd + S 保存";
    case "saving":
      return "正在保存...";
    case "saved":
      return "已保存";
    case "error":
      return "保存失败";
    default:
      return saveMode === "manual" ? "手动保存（Ctrl / Cmd + S）" : "编辑文本自动保存";
  }
}

export function MarkdownEditor({
  onChange,
  onSave,
  saveMode,
  saveStatus,
  title,
  value,
}: MarkdownEditorProps) {
  const { editorRef } = useEditor({ onChange, onSave, title, value });
  const characterCount = Array.from(value).length;

  return (
    <div className="flex h-full min-h-72 flex-col overflow-hidden bg-[color-mix(in_oklab,var(--color-primary)_2%,transparent)]">
      <div className="min-h-0 flex-1 overflow-hidden" ref={editorRef} />
      <div className="flex items-center justify-between gap-4 border-t border-primary/10 bg-[color-mix(in_oklab,var(--color-primary)_4%,var(--color-background)_96%)] px-4 py-2 text-xs">
        <div className="flex min-w-0 items-center gap-2 leading-none text-muted-foreground">
          {saveStatus === "saving" ? (
            <Spinner className="size-3.5 shrink-0 flex-none text-primary" />
          ) : null}
          <span className="truncate">{getSaveStatusText(saveStatus, saveMode)}</span>
        </div>
        <div className="flex shrink-0 items-center gap-3 text-muted-foreground tabular-nums">
          <span>{characterCount} 字符</span>
          <span>UTF-8</span>
        </div>
      </div>
    </div>
  );
}
