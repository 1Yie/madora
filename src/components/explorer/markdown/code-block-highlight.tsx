import { useEffect, useState } from "react";
import { codeToHtml, type BundledLanguage, type BundledTheme } from "shiki";
import { useTheme } from "@/components/system/theme-provider";
import { ScrollArea } from "@/components/ui/scroll-area";

type HighlightedCodeBlockProps = {
  lang: string;
  code: string;
};

function normalizeLanguage(lang?: string): BundledLanguage | "text" {
  if (!lang) return "text";
  const lower = lang.toLowerCase();
  const map: Record<string, BundledLanguage | "text"> = {
    js: "javascript",
    ts: "typescript",
    jsx: "javascript",
    tsx: "typescript",
    py: "python",
    rb: "ruby",
    rs: "rust",
    go: "go",
    sh: "bash",
    zsh: "bash",
    bash: "bash",
    shell: "bash",
    yml: "yaml",
    yaml: "yaml",
    md: "markdown",
    mdx: "markdown",
    sql: "sql",
  };
  return map[lower] ?? (lang as BundledLanguage);
}

function getShikiTheme(theme: "light" | "dark"): BundledTheme {
  return theme === "dark" ? "github-dark" : "github-light";
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function plainTextBlock(code: string): string {
  const escaped = escapeHtml(code);
  return `<pre class="shiki"><code>${escaped}</code></pre>`;
}

export function HighlightedCodeBlock({ lang, code }: HighlightedCodeBlockProps) {
  const { resolvedTheme } = useTheme();
  const [html, setHtml] = useState(() => plainTextBlock(code));
  const normalized = normalizeLanguage(lang);

  useEffect(() => {
    if (normalized === "text") {
      setHtml(plainTextBlock(code));
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const result = await codeToHtml(code, {
          lang: normalized,
          theme: getShikiTheme(resolvedTheme),
        });
        if (!cancelled) setHtml(result);
      } catch {
        if (!cancelled) setHtml(plainTextBlock(code));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [code, normalized, resolvedTheme]);

  return (
    <ScrollArea
      className="my-6 rounded-lg border border-border [&_pre]:m-0 [&_pre]:rounded-lg [&_pre]:p-4 [&_code]:text-sm [&_code]:leading-relaxed"
    >
      <div dangerouslySetInnerHTML={{ __html: html }} />
    </ScrollArea>
  );
}
