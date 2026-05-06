import { cn } from "@/lib/utils";
import { useEditor } from "@/hooks/use-editor";

type SaveStatus = "idle" | "saving" | "saved" | "error";

type MarkdownEditorProps = {
  onChange: (value: string) => void;
  saveError: string | null;
  saveStatus: SaveStatus;
  value: string;
};

function getSaveStatusText(saveStatus: SaveStatus, saveError: string | null): string {
  switch (saveStatus) {
    case "saving":
      return "正在保存...";
    case "saved":
      return "已保存";
    case "error":
      return saveError ?? "保存失败";
    default:
      return "编辑文本自动保存";
  }
}

export function MarkdownEditor({
  onChange,
  saveError,
  saveStatus,
  value,
}: MarkdownEditorProps) {
  const { editorRef } = useEditor({ onChange, value });

  return (
    <div className="flex h-full min-h-72 flex-col overflow-hidden">
      <div className="min-h-0 flex-1 overflow-hidden" ref={editorRef} />
      <div className="flex items-center border-t border-border/70 px-4 py-2 text-xs">
        <span
          className={cn(
            "truncate",
            saveStatus === "error" ? "text-destructive" : "text-muted-foreground",
          )}
        >
          {getSaveStatusText(saveStatus, saveError)}
        </span>
      </div>
    </div>
  );
}
