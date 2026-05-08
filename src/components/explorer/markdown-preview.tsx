import type { ComponentProps } from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { openUrl } from "@tauri-apps/plugin-opener";

import { cn } from "@/lib/utils";

type MarkdownPreviewProps = {
  className?: string;
  content: string;
};

const components: ComponentProps<typeof Markdown>["components"] = {
  a: ({ href, children, ...props }) => (
    <a
      {...props}
      href={href}
      onClick={(event) => {
        event.preventDefault();
        if (href) openUrl(href);
      }}
    >
      {children}
    </a>
  ),
};

export function MarkdownPreview({ className, content }: MarkdownPreviewProps) {
  return (
    <div
      className={cn(
        "h-full overflow-auto p-6",
        "prose-custom",
        className,
      )}
    >
      <Markdown components={components} remarkPlugins={[remarkGfm]}>
        {content}
      </Markdown>
    </div>
  );
}
