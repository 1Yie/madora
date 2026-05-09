import { invoke } from "@tauri-apps/api/core";
import { Check, ChevronsLeftRight } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { explorerBottomSectionHeightClassName } from "../layout";
import { cn } from "@/lib/utils";

interface NormalBlock {
  type: "normal";
  content: string;
}

interface ConflictBlock {
  type: "conflict";
  ours: string;
  theirs: string;
  label: string;
}

type Block = NormalBlock | ConflictBlock;

type SideChoice = "ours" | "theirs" | "both";

function parseConflictMarkers(content: string): Block[] {
  const CONFLICT_RE = /^<{7}[^\n]*\n([\s\S]*?)^={7}\n([\s\S]*?)^>{7}([^\n]*)/gm;

  const blocks: Block[] = [];
  let lastIndex = 0;

  for (const match of content.matchAll(CONFLICT_RE)) {
    const matchStart = match.index!;

    if (matchStart > lastIndex) {
      blocks.push({ type: "normal", content: content.slice(lastIndex, matchStart) });
    }

    blocks.push({
      type: "conflict",
      ours: match[1],
      theirs: match[2],
      label: match[3].trim(),
    });

    lastIndex = matchStart + match[0].length;
    if (content[lastIndex] === "\n") lastIndex++;
  }

  if (lastIndex < content.length) {
    blocks.push({ type: "normal", content: content.slice(lastIndex) });
  }

  return blocks;
}

export function ConflictEditor({
  content,
  filePath,
  rootPath,
}: {
  content: string;
  filePath: string;
  rootPath: string;
}) {
  const [blocks] = useState<Block[]>(() => parseConflictMarkers(content));
  const [choices, setChoices] = useState<Record<number, SideChoice>>({});
  const [resolving, setResolving] = useState(false);

  const conflictIndices = blocks
    .map((b, i) => (b.type === "conflict" ? i : -1))
    .filter((i) => i !== -1);

  const toggle = (index: number, side: SideChoice) => {
    setChoices((prev) => ({
      ...prev,
      [index]: prev[index] === side ? (undefined as unknown as SideChoice) : side,
    }));
  };

  const resolved = blocks.map((block, i) => {
    if (block.type === "normal") return block.content;
    const choice = choices[i];
    if (choice === "ours") return (block as ConflictBlock).ours;
    if (choice === "theirs") return (block as ConflictBlock).theirs;
    if (choice === "both")
      return [(block as ConflictBlock).ours, (block as ConflictBlock).theirs]
        .filter(Boolean)
        .join("");
    return null;
  });

  const allResolved = conflictIndices.every((i) => resolved[i] !== null);
  const unresolvedCount = conflictIndices.filter((i) => choices[i] === undefined).length;

  const handleResolve = async () => {
    const final = resolved.map((r) => r ?? "").join("");
    setResolving(true);
    try {
      await invoke("write_workspace_file", { content: final, path: filePath });
      await invoke("git_stage_file", { path: filePath, rootPath });
      // 清掉 MarkdownWorkspace 可能缓存的旧草稿
      window.localStorage.removeItem(`madora-markdown-draft:${filePath}`);
      window.dispatchEvent(
        new CustomEvent("workspace-file-saved", {
          detail: { filePath, source: "conflict-resolve" },
        }),
      );
    } finally {
      setResolving(false);
    }
  };

  return (
    <div className="h-full border-l border-border bg-background">
      <div className="divide-y divide-border">
        {blocks.map((block, i) => {
          if (block.type !== "conflict") {
            return null;
          }

          const conflictBlock = block;
          const choice = choices[i];
          const conflictNumber = conflictIndices.indexOf(i) + 1;

          return (
            <div key={i} className="bg-muted/30">
              <div className="flex items-center justify-between bg-muted gap-2 p-2">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium text-muted-foreground">
                    冲突 {conflictNumber} / {conflictIndices.length}
                  </span>
                  {choice && (
                    <span className="flex items-center gap-1 text-xs text-green-600 dark:text-green-400">
                      <Check className="size-3" />
                      已选择
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => toggle(i, "both")}
                    className="inline-flex items-center gap-1 rounded px-2 py-0.5 text-xs font-medium transition-colors"
                    style={{
                      backgroundColor:
                        choice === "both"
                          ? "var(--color-neutral-600, #525252)"
                          : "var(--color-neutral-200, #e5e5e5)",
                      color: choice === "both" ? "#fff" : "var(--color-neutral-600, #525252)",
                    }}
                  >
                    {choice === "both" && <Check className="size-3" />}
                    <ChevronsLeftRight className="size-3" />
                    两者都保留
                  </button>
                </div>
              </div>

              <div className="flex min-h-0">
                <div className="min-w-0 flex-1 border-r border-border ">
                  <div className="sticky top-0 z-10 flex items-center justify-between gap-2 border-b border-t border-border bg-green-50 px-3 py-1.5 dark:bg-green-950">
                    <span className="truncate text-xs font-medium text-green-700 dark:text-green-400">
                      当前分支 HEAD
                    </span>
                    <button
                      type="button"
                      onClick={() => toggle(i, "ours")}
                      className="inline-flex shrink-0 items-center gap-1 rounded px-2 py-0.5 text-xs font-medium transition-colors"
                      style={{
                        backgroundColor:
                          choice === "ours"
                            ? "var(--color-green-600, #16a34a)"
                            : "var(--color-green-100, #dcfce7)",
                        color: choice === "ours" ? "#fff" : "var(--color-green-700, #15803d)",
                      }}
                    >
                      {choice === "ours" && <Check className="size-3" />}
                      采用
                    </button>
                  </div>
                  <pre className="whitespace-pre-wrap break-all px-3 py-3 font-mono text-sm">
                    {conflictBlock.ours || (
                      <span className="italic text-muted-foreground">（空）</span>
                    )}
                  </pre>
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex sticky top-0 z-10 items-center justify-between gap-2 border-b border-t  border-border bg-blue-50 px-3 py-1.5 dark:bg-blue-950/20">
                    <span className="truncate text-xs font-medium text-blue-700 dark:text-blue-400">
                      {conflictBlock.label || "传入更改"}
                    </span>
                    <button
                      type="button"
                      onClick={() => toggle(i, "theirs")}
                      className="inline-flex shrink-0 items-center gap-1 rounded px-2 py-0.5 text-xs font-medium transition-colors"
                      style={{
                        backgroundColor:
                          choice === "theirs"
                            ? "var(--color-blue-600, #2563eb)"
                            : "var(--color-blue-100, #dbeafe)",
                        color: choice === "theirs" ? "#fff" : "var(--color-blue-700, #1d4ed8)",
                      }}
                    >
                      {choice === "theirs" && <Check className="size-3" />}
                      采用
                    </button>
                  </div>
                  <pre className="whitespace-pre-wrap break-all px-3 py-3 font-mono text-sm">
                    {conflictBlock.theirs || (
                      <span className="italic text-muted-foreground">（空）</span>
                    )}
                  </pre>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div
        className={cn(
          "sticky bottom-0 z-10 bg-background",
          "divide-y divide-border border-t border-border  flex items-center p-2",
          explorerBottomSectionHeightClassName,
        )}
      >
        <Button
          className="w-full"
          disabled={!allResolved || resolving}
          onClick={() => void handleResolve()}
          size="sm"
          variant="default"
        >
          {resolving
            ? "正在解决..."
            : allResolved
              ? "完成解决冲突"
              : `还有 ${unresolvedCount} 处冲突未选择`}
        </Button>
      </div>
    </div>
  );
}
