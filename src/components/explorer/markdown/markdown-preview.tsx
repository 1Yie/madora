import type { ComponentProps } from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { openUrl } from "@tauri-apps/plugin-opener";

import { cn } from "@/lib/utils";
import { HighlightedCodeBlock } from "./code-block-highlight";

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
  ol: ({ start, children, ...props }) => (
    <ol start={start} {...props}>
      {children}
    </ol>
  ),
  ul: ({ children, ...props }) => <ul {...props}>{children}</ul>,
  li: ({ children, ...props }) => <li {...props}>{children}</li>,
  code: ({ className, children, ...props }) => {
    const match = /^language-(\w+)/.exec(className || "");
    if (match) {
      return <HighlightedCodeBlock code={String(children).replace(/\n$/, "")} lang={match[1]} />;
    }
    return (
      <code className={className} {...props}>
        {children}
      </code>
    );
  },
  pre: ({ children }) => <div>{children}</div>,
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
