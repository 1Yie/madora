import { useEditor } from "@/hooks/use-editor";
import { Spinner } from "@/components/ui/spinner";

type SaveStatus = "idle" | "saving" | "saved" | "error";

type MarkdownEditorProps = {
  onChange: (value: string) => void;
  saveStatus: SaveStatus;
  title?: string;
  value: string;
};

function getSaveStatusText(saveStatus: SaveStatus): string {
  switch (saveStatus) {
    case "saving":
      return "正在保存...";
    case "saved":
      return "已保存";
    default:
      return "编辑文本自动保存";
  }
}

export function MarkdownEditor({
  onChange,
  saveStatus,
  title,
  value,
}: MarkdownEditorProps) {
  const { editorRef } = useEditor({ onChange, title, value });
  const characterCount = Array.from(value).length;

  return (
    <div className="flex h-full min-h-72 flex-col overflow-hidden">
      <div className="min-h-0 flex-1 overflow-hidden" ref={editorRef} />
      <div className="flex items-center justify-between gap-4 border-t border-border/70 px-4 py-2 text-xs">
        <div className="flex min-w-0 items-center gap-2 leading-none text-muted-foreground">
          {saveStatus === "saving" ? (
            <Spinner className="size-3.5 shrink-0 flex-none text-primary" />
          ) : null}
          <span className="truncate">{getSaveStatusText(saveStatus)}</span>
        </div>
        <div className="flex shrink-0 items-center gap-3 text-muted-foreground tabular-nums">
          <span>{characterCount} 字符</span>
          <span>UTF-8</span>
        </div>
      </div>
    </div>
  );
}
