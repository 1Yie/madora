import { useEditor } from "@/hooks/use-editor";

type MarkdownEditorProps = {
  onChange: (value: string) => void;
  value: string;
};

export function MarkdownEditor({ onChange, value }: MarkdownEditorProps) {
  const editorRef = useEditor({ onChange, value });

  return (
    <div className="h-full min-h-72 overflow-hidden" ref={editorRef} />
  );
}
