import { useEffect, useState } from "react";
import { codeToHtml, type BundledLanguage, type BundledTheme } from "shiki";

import { useTheme } from "@/components/system/theme-provider";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

type CodeBlockProps = {
  code: string;
  language?: string;
  wrapLongLines?: boolean;
};

function normalizeLanguage(language?: string): BundledLanguage | "text" {
  if (!language) {
    return "text";
  }

  switch (language) {
    case "plaintext":
    case "text":
    case "txt":
      return "text";
    case "javascript":
    case "typescript":
    case "css":
    case "html":
    case "json":
    case "markdown":
    case "bash":
    case "yaml":
    case "toml":
    case "sql":
    case "rust":
      return language;
    case "jsx":
      return "javascript";
    case "tsx":
      return "typescript";
    case "sh":
    case "shell":
    case "zsh":
      return "bash";
    case "yml":
      return "yaml";
    case "md":
    case "mdx":
      return "markdown";
    default:
      return "text";
  }
}

function getShikiTheme(theme: "light" | "dark"): BundledTheme {
  return theme === "dark" ? "github-dark" : "github-light";
}

function renderPlainText(code: string): string {
  const escaped = code
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  return `<pre class="shiki madora-code-block"><code>${escaped}</code></pre>`;
}

export function CodeBlock({ code, language, wrapLongLines = false }: CodeBlockProps) {
  const { resolvedTheme } = useTheme();
  const [html, setHtml] = useState<string>(renderPlainText(code));

  useEffect(() => {
    let cancelled = false;

    const renderCode = async () => {
      const normalizedLanguage = normalizeLanguage(language);

      if (normalizedLanguage === "text") {
        if (!cancelled) {
          setHtml(renderPlainText(code));
        }

        return;
      }

      try {
        const nextHtml = await codeToHtml(code, {
          lang: normalizedLanguage,
          theme: getShikiTheme(resolvedTheme),
          transformers: [
            {
              pre(node) {
                node.properties.class = ["shiki", "madora-code-block"];
                node.properties.style = ["margin:0;background-color:transparent;"];
              },
            },
          ],
        });

        if (!cancelled) {
          setHtml(nextHtml);
        }
      } catch {
        if (!cancelled) {
          setHtml(renderPlainText(code));
        }
      }
    };

    void renderCode();

    return () => {
      cancelled = true;
    };
  }, [code, language, resolvedTheme]);

  return (
    <ScrollArea
      className={cn(
        wrapLongLines && "[&_code]:wrap-break-word [&_code]:whitespace-pre-wrap [&_pre]:whitespace-pre-wrap",
      )}
    >
      <div dangerouslySetInnerHTML={{ __html: html }} />
    </ScrollArea>
  );
}
