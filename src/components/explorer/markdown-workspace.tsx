import { useEffect, useState } from "react";

import { MarkdownEditor } from "./markdown-editor";

type MarkdownWorkspaceProps = {
  content: string;
  filePath: string;
};

export function MarkdownWorkspace({ content, filePath }: MarkdownWorkspaceProps) {
  const [value, setValue] = useState(content);

  useEffect(() => {
    setValue(content);
  }, [content, filePath]);

  return (
    <MarkdownEditor
      onChange={setValue}
      value={value}
    />
  );
}
