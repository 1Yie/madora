import { invoke } from "@tauri-apps/api/core";
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  Check,
  ClockIcon,
  CornerDownLeft,
  Ellipsis,
  FolderKey,
  GitBranch,
  History,
  KeyRound,
  LoaderCircle,
  Plus,
  RefreshCw,
  RotateCcw,
  Settings2,
  UserIcon,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

// Confirmation uses NativeDialog (HTML <dialog>) to keep a consistent
// native-styled modal across the app.
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Menu, MenuItem, MenuPopup, MenuTrigger } from "@/components/ui/menu";
import {
  NativeDialog,
  NativeDialogClose,
  NativeDialogDescription,
  NativeDialogFooter,
  NativeDialogHeader,
  NativeDialogPanel,
  NativeDialogTitle,
} from "@/components/ui/native-dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { showErrorToast, toastManager } from "@/components/ui/toast";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

import type { GitAuth, GitLogEntry, GitStatus, GitSyncResult } from "./git-types";

type GitPanelProps = {
  disabled?: boolean;
  rootPath: string | null;
  status: GitStatus | null;
  busy: boolean;
  onRefresh: () => Promise<void>;
  onStatusChange: (status: GitStatus) => void;
};

type GitWorkbenchTab = "commit" | "history" | "remote" | "ssh";

type GitHistoryAction =
  | { type: "undo-last" }
  | { type: "revert-commit"; commitId: string; summary: string }
  | null;

function getBranchLabel(status: GitStatus | null): string {
  if (!status?.branch?.name) {
    return "未初始化 Git";
  }

  return status.branch.name;
}

function getSummary(status: GitStatus | null): string {
  if (!status) {
    return "正在读取仓库状态";
  }

  if (!status.hasRepository) {
    return "当前工作区还不是 Git 仓库";
  }

  if (status.conflictedFiles.length > 0) {
    return `${status.conflictedFiles.length} 个冲突待解决`;
  }

  if (status.totalChangedCount === 0) {
    return "工作区干净";
  }

  return `${status.stagedCount} 已暂存 / ${status.unstagedCount} 未暂存`;
}

export function GitPanel({
  disabled = false,
  rootPath,
  status,
  busy,
  onRefresh,
  onStatusChange,
}: GitPanelProps) {
  const [workbenchOpen, setWorkbenchOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<GitWorkbenchTab>("commit");
  const [actionBusy, setActionBusy] = useState(false);
  const [commitMessage, setCommitMessage] = useState("");
  const [remoteName, setRemoteName] = useState("origin");
  const [remoteUrl, setRemoteUrl] = useState("");
  const [authUsername, setAuthUsername] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [sshUsername, setSshUsername] = useState("git");
  const [sshPrivateKeyPath, setSshPrivateKeyPath] = useState("");
  const [sshPassphrase, setSshPassphrase] = useState("");
  const [gitLog, setGitLog] = useState<GitLogEntry[]>([]);
  const [pendingHistoryAction, setPendingHistoryAction] = useState<GitHistoryAction>(null);

  const primaryRemote = useMemo(() => {
    if (!status?.remotes.length) {
      return null;
    }

    return status.remotes.find((remote) => remote.name === "origin") ?? status.remotes[0];
  }, [status?.remotes]);

  useEffect(() => {
    if (!primaryRemote) {
      return;
    }

    setRemoteName(primaryRemote.name);
    setRemoteUrl(primaryRemote.url ?? "");
  }, [primaryRemote]);

  const canOperate = Boolean(rootPath) && !disabled && !busy && !actionBusy;

  const buildAuth = (): GitAuth | null => {
    const username = authUsername.trim();
    const password = authPassword.trim();
    const normalizedSshUsername = sshUsername.trim();
    const normalizedSshPrivateKeyPath = sshPrivateKeyPath.trim();
    const normalizedSshPassphrase = sshPassphrase.trim();

    if (
      !username &&
      !password &&
      !normalizedSshUsername &&
      !normalizedSshPrivateKeyPath &&
      !normalizedSshPassphrase
    ) {
      return null;
    }

    return {
      password: password || null,
      sshPassphrase: normalizedSshPassphrase || null,
      sshPrivateKeyPath: normalizedSshPrivateKeyPath || null,
      sshUsername: normalizedSshUsername || null,
      username: username || null,
    };
  };

  const runAction = async <T,>(
    action: () => Promise<T>,
    successMessage?: string,
  ): Promise<T | null> => {
    setActionBusy(true);

    try {
      const result = await action();

      if (successMessage) {
        toastManager.add({
          priority: "low",
          title: successMessage,
          type: "success",
        });
      }

      return result;
    } catch (error) {
      showErrorToast("Git 操作失败", error instanceof Error ? error.message : String(error));
      return null;
    } finally {
      setActionBusy(false);
    }
  };

  const loadGitLog = async () => {
    if (!rootPath || !status?.hasRepository) {
      setGitLog([]);
      return;
    }

    try {
      const entries = await invoke<GitLogEntry[]>("git_log", { limit: null, rootPath });
      setGitLog(entries);
    } catch {
      setGitLog([]);
    }
  };

  useEffect(() => {
    if (!workbenchOpen || !status?.hasRepository) {
      return;
    }

    void loadGitLog();
  }, [workbenchOpen, status?.hasRepository]);

  const refreshStatus = async () => {
    await onRefresh();
  };

  const initRepository = async () => {
    if (!rootPath) {
      return;
    }

    const nextStatus = await runAction(
      () => invoke<GitStatus>("git_init", { rootPath }),
      "已初始化 Git 仓库",
    );

    if (nextStatus) {
      onStatusChange(nextStatus);
      setWorkbenchOpen(true);
    }
  };

  const saveRemote = async () => {
    if (!rootPath) {
      return;
    }

    const trimmedName = remoteName.trim();
    const trimmedUrl = remoteUrl.trim();

    if (!trimmedName || !trimmedUrl) {
      showErrorToast("远端保存失败", "请填写远端名称和仓库地址");
      return;
    }

    const nextStatus = await runAction(
      () =>
        invoke<GitStatus>("git_set_remote", {
          remoteName: trimmedName,
          remoteUrl: trimmedUrl,
          rootPath,
        }),
      "远端已保存",
    );

    if (nextStatus) {
      onStatusChange(nextStatus);
      await loadGitLog();
    }
  };

  const commitAll = async () => {
    if (!rootPath) {
      return;
    }

    const trimmedMessage = commitMessage.trim();

    if (!trimmedMessage) {
      showErrorToast("提交失败", "请输入提交说明");
      return;
    }

    const result = await runAction(
      () =>
        invoke<GitSyncResult>("git_commit_all", {
          authorEmail: null,
          authorName: null,
          message: trimmedMessage,
          rootPath,
        }),
      "提交成功",
    );

    if (result) {
      setCommitMessage("");
      await refreshStatus();
      await loadGitLog();
      setActiveTab("history");
    }
  };

  const push = async () => {
    if (!rootPath) {
      return;
    }

    const result = await runAction(
      () =>
        invoke<GitSyncResult>("git_push", {
          auth: buildAuth(),
          branchName: status?.branch?.name ?? null,
          remoteName: remoteName.trim() || primaryRemote?.name || "origin",
          rootPath,
        }),
      "推送成功",
    );

    if (result) {
      await refreshStatus();
      await loadGitLog();
      setActiveTab("history");
    }
  };

  const pull = async () => {
    if (!rootPath) {
      return;
    }

    const result = await runAction(
      () =>
        invoke<GitSyncResult>("git_pull", {
          auth: buildAuth(),
          authorEmail: null,
          authorName: null,
          branchName: status?.branch?.name ?? null,
          remoteName: remoteName.trim() || primaryRemote?.name || "origin",
          rootPath,
        }),
      "拉取完成",
    );

    if (result) {
      if (result.conflicts.length > 0) {
        showErrorToast("存在合并冲突", result.conflicts.join("\n"));
      }

      await refreshStatus();
      await loadGitLog();
      setActiveTab("history");
    }
  };

  const pickSshPrivateKeyFile = async () => {
    const selectedPath = await runAction(
      () => invoke<string | null>("git_pick_ssh_private_key_file"),
      "已选择 SSH 私钥文件",
    );

    if (selectedPath) {
      setSshPrivateKeyPath(selectedPath);
    }
  };

  const undoLastCommit = async () => {
    if (!rootPath) {
      return;
    }

    const result = await runAction(
      () => invoke<GitSyncResult>("git_undo_last_commit", { rootPath }),
      "已撤销最近提交",
    );

    if (result) {
      await refreshStatus();
      await loadGitLog();
    }
  };

  const revertHistoryCommit = async (commitId: string) => {
    if (!rootPath) {
      return;
    }

    const result = await runAction(
      () =>
        invoke<GitSyncResult>("git_revert_commit", {
          authorEmail: null,
          authorName: null,
          commitId,
          rootPath,
        }),
      "已生成回滚提交",
    );

    if (result) {
      if (result.conflicts.length > 0) {
        showErrorToast("回滚提交出现冲突", result.conflicts.join("\n"));
      }

      await refreshStatus();
      await loadGitLog();
    }
  };

  const openWorkbench = (nextTab: GitWorkbenchTab = "commit") => {
    setActiveTab(nextTab);
    setWorkbenchOpen(true);
  };

  const branchLabel = getBranchLabel(status);
  const summary = getSummary(status);
  const statusTooltip = `${branchLabel} · ${summary}`;
  const upstreamLabel = status?.branch?.upstream ?? null;

  return (
    <>
      <div className="flex min-w-0 flex-1 items-center justify-between gap-2 px-2">
        <Tooltip>
          <TooltipTrigger
            className="flex min-w-0 flex-1 items-center gap-2 overflow-hidden rounded-md px-2 py-1 text-left leading-none text-muted-foreground outline-none"
            render={
              <button
                aria-label={statusTooltip}
                className="flex min-w-0 flex-1 items-center gap-2 overflow-hidden rounded-md px-2 py-1 text-left leading-none text-muted-foreground outline-none hover:bg-sidebar-accent/60"
                type="button"
              />
            }
          >
            {busy || actionBusy ? (
              <LoaderCircle className="size-3.5 shrink-0 animate-spin text-primary" />
            ) : (
              <GitBranch className="size-3.5 shrink-0 text-primary" />
            )}
            <div className="flex min-w-0 flex-1 items-center gap-2 overflow-hidden">
              <span className="max-w-[45%] shrink truncate font-medium text-foreground">
                {branchLabel}
              </span>
              <span className="min-w-0 flex-1 truncate">{summary}</span>
            </div>
          </TooltipTrigger>
          <TooltipContent className="max-w-80" side="top">
            {statusTooltip}
          </TooltipContent>
        </Tooltip>
        <div className="flex shrink-0 items-center gap-1.5 text-muted-foreground">
          {!status?.hasRepository ? (
            <Button
              disabled={!canOperate}
              onClick={() => void initRepository()}
              size="xs"
              variant="outline"
            >
              <Plus />
              初始化
            </Button>
          ) : (
            <>
              <Button
                disabled={!canOperate}
                onClick={() => openWorkbench("remote")}
                size="icon-xs"
                variant="ghost"
              >
                <Settings2 />
              </Button>
              <Button
                disabled={!canOperate}
                onClick={() => openWorkbench("history")}
                size="icon-xs"
                variant="ghost"
              >
                <History />
              </Button>
              <Button
                disabled={!canOperate}
                onClick={() => openWorkbench("commit")}
                size="icon-xs"
                variant="ghost"
              >
                <Check />
              </Button>
            </>
          )}
          <Button
            disabled={!canOperate}
            onClick={() => void refreshStatus()}
            size="icon-xs"
            variant="ghost"
          >
            <RefreshCw />
          </Button>
        </div>
      </div>

      <NativeDialog
        className="max-h-[min(88vh,840px)] max-w-[min(980px,calc(100vw-2rem))]"
        onOpenChange={setWorkbenchOpen}
        open={workbenchOpen}
      >
        <div className="flex h-[min(88vh,720px)] min-h-0 min-w-0 flex-col overflow-hidden">
          <NativeDialogClose
            className="absolute inset-e-2 top-2 z-10"
            onClick={() => setWorkbenchOpen(false)}
          />
          <NativeDialogHeader className="border-b border-border pb-2">
            <NativeDialogTitle>Git 工作台</NativeDialogTitle>

            <div className="grid gap-3 pt-2 sm:grid-cols-3">
              <div className="rounded-xl border border-border bg-background px-4 py-3">
                <div className="text-xs text-muted-foreground">当前分支</div>
                <div className="mt-1 truncate text-sm font-medium text-foreground">
                  {branchLabel}
                </div>
              </div>
              <div className="rounded-xl border border-border bg-background px-4 py-3">
                <div className="text-xs text-muted-foreground">工作区状态</div>
                <div className="mt-1 truncate text-sm font-medium text-foreground">{summary}</div>
              </div>
              <div className="rounded-xl border border-border bg-background px-4 py-3">
                <div className="text-xs text-muted-foreground">远端</div>
                <div className="mt-1 truncate text-sm font-medium text-foreground">
                  {remoteName || "origin"}
                </div>
              </div>
            </div>
          </NativeDialogHeader>

          <Tabs
            className="flex min-h-0 flex-1 flex-col gap-0"
            onValueChange={(value) => setActiveTab(value as GitWorkbenchTab)}
            value={activeTab}
          >
            <div className="shrink-0 border-b border-border px-4">
              <TabsList className="w-full justify-start" variant="underline">
                <TabsTrigger value="commit">
                  <Check />
                  提交
                </TabsTrigger>
                <TabsTrigger value="history">
                  <History />
                  历史
                </TabsTrigger>
                <TabsTrigger value="remote">
                  <Settings2 />
                  远端
                </TabsTrigger>
                <TabsTrigger value="ssh">
                  <KeyRound />
                  SSH
                </TabsTrigger>
              </TabsList>
            </div>

            <NativeDialogPanel
              className={cn("pt-6", activeTab === "history" && "flex flex-col overflow-hidden p-0")}
            >
              <TabsContent className="space-y-6 overflow-y-auto pr-1" value="commit">
                <div className="space-y-3">
                  <div>
                    <div className="text-sm font-medium text-foreground">提交说明</div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      会将当前工作区所有 Git 变更加入暂存区并创建提交。
                    </p>
                  </div>
                  <Textarea
                    onChange={(event) => setCommitMessage(event.target.value)}
                    placeholder="例如：update cloud sync workflow"
                    value={commitMessage}
                  />
                  <div className="flex items-center gap-2">
                    <Button
                      disabled={!canOperate || !status?.totalChangedCount}
                      loading={actionBusy}
                      onClick={() => void commitAll()}
                    >
                      <Check />
                      提交所有更改
                    </Button>
                    <Button
                      disabled={!canOperate}
                      onClick={() => void refreshStatus()}
                      variant="outline"
                    >
                      <RefreshCw />
                      刷新状态
                    </Button>
                  </div>
                </div>
              </TabsContent>

              <TabsContent className="flex min-h-0 flex-1 flex-col overflow-hidden" value="history">
                <div className="flex p-6 shrink-0 items-center justify-between gap-3 border-b border-border pb-4">
                  <div>
                    <div className="text-sm font-medium text-foreground">提交历史</div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      显示当前工作区的全部提交记录。
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      disabled={actionBusy || gitLog.length === 0}
                      onClick={() => setPendingHistoryAction({ type: "undo-last" })}
                      variant="outline"
                    >
                      <RotateCcw />
                      撤销最近提交
                    </Button>
                    <Button
                      disabled={actionBusy}
                      onClick={() => void loadGitLog()}
                      variant="outline"
                    >
                      <RefreshCw />
                      刷新记录
                    </Button>
                  </div>
                </div>

                <div className="min-h-0 flex-1 overflow-y-auto pr-1">
                  <div className="space-y-0.5 py-3  p-6">
                    {gitLog.map((entry, index) => (
                      <div key={entry.id} className="git-entry flex items-stretch gap-0">
                        <div className="relative flex w-8 shrink-0 items-stretch justify-center">
                          {index > 0 ? <div className="absolute top-0 h-2 w-px bg-border" /> : null}
                          <div
                            className={cn(
                              "absolute bottom-0 top-0 w-px",
                              index === 0 ? "bg-primary/30" : "bg-border",
                              index === gitLog.length - 1 && "bottom-auto h-2.5",
                            )}
                          />
                          <div
                            className={cn(
                              "relative z-10 mt-2.5 h-2.5 w-2.5 shrink-0 rounded-full border-2 bg-background",
                              index === 0
                                ? "border-primary ring-3 ring-primary/12"
                                : "border-primary/40",
                            )}
                          />
                        </div>

                        <div
                          className={cn(
                            "min-w-0 flex-1 py-1.5 pl-1",
                            index < gitLog.length - 1 && "border-b border-border/70",
                          )}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0 flex-1 truncate font-sans text-sm font-medium text-foreground">
                              {entry.summary}
                            </div>
                            <Menu>
                              <MenuTrigger
                                render={
                                  <Button
                                    aria-label={`提交 ${entry.id.slice(0, 7)} 的更多操作`}
                                    size="icon-xs"
                                    variant="ghost"
                                  />
                                }
                              >
                                <Ellipsis />
                              </MenuTrigger>
                              <MenuPopup
                                align="end"
                                portalProps={{
                                  container:
                                    (document.querySelector("dialog[open]") as HTMLElement | null) ??
                                    document.body,
                                }}
                              >
                                <MenuItem
                                  disabled={actionBusy || index !== 0}
                                  onClick={() => setPendingHistoryAction({ type: "undo-last" })}
                                >
                                  <RotateCcw />
                                  撤销最近提交
                                </MenuItem>
                                <MenuItem
                                  disabled={actionBusy}
                                  onClick={() =>
                                    setPendingHistoryAction({
                                      type: "revert-commit",
                                      commitId: entry.id,
                                      summary: entry.summary,
                                    })
                                  }
                                >
                                  <CornerDownLeft />
                                  回滚这个提交
                                </MenuItem>
                              </MenuPopup>
                            </Menu>
                          </div>

                          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
                            {index === 0 && (
                              <>
                                <span className="rounded border border-primary/30 bg-primary/10 px-1.5 py-px text-[11px] text-primary">
                                  HEAD{branchLabel !== "未初始化 Git" ? ` · ${branchLabel}` : ""}
                                </span>
                                {upstreamLabel ? (
                                  <span className="rounded border border-primary/20 bg-primary/6 px-1.5 py-px text-[11px] text-primary/80">
                                    {upstreamLabel}
                                  </span>
                                ) : null}
                              </>
                            )}
                            <span className="flex items-center gap-1 text-xs text-muted-foreground">
                              <UserIcon className="h-3 w-3" />
                              {entry.authorName}
                            </span>
                            <span className="flex items-center gap-1 text-xs text-muted-foreground">
                              <ClockIcon className="h-3 w-3" />
                              {entry.committedAt}
                            </span>
                            <span className="rounded border border-border bg-muted/70 px-1.5 py-px font-mono text-[11px] text-muted-foreground">
                              {entry.id.slice(0, 7)}
                            </span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </TabsContent>

              <TabsContent className="space-y-6 overflow-y-auto pr-1" value="remote">
                <div className="space-y-4">
                  <div>
                    <div className="text-sm font-medium text-foreground">远端仓库</div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      配置远端地址，并从这里发起拉取或推送。
                    </p>
                  </div>
                  <div className="space-y-3">
                    <Input
                      nativeInput
                      onChange={(event) => setRemoteName(event.target.value)}
                      placeholder="origin"
                      value={remoteName}
                    />
                    <Input
                      nativeInput
                      onChange={(event) => setRemoteUrl(event.target.value)}
                      placeholder="git@github.com:user/repo.git 或 https://github.com/user/repo.git"
                      value={remoteUrl}
                    />
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Button loading={actionBusy} onClick={() => void saveRemote()}>
                      <Settings2 />
                      保存远端
                    </Button>
                    <Button
                      disabled={!canOperate}
                      loading={actionBusy}
                      onClick={() => void pull()}
                      variant="outline"
                    >
                      <ArrowDownToLine />
                      拉取
                    </Button>
                    <Button
                      disabled={!canOperate}
                      loading={actionBusy}
                      onClick={() => void push()}
                      variant="outline"
                    >
                      <ArrowUpFromLine />
                      推送
                    </Button>
                  </div>
                </div>
              </TabsContent>

              <TabsContent className="space-y-6 overflow-y-auto pr-1" value="ssh">
                <div className="space-y-4">
                  <div>
                    <div className="text-sm font-medium text-foreground">SSH / HTTPS 认证</div>
                    <p className="mt-1 text-xs text-muted-foreground">默认优先使用 SSH Agent。</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      这里可以补充 SSH 私钥路径、SSH 用户名，或者 HTTPS 的用户名和 Token。
                    </p>
                  </div>

                  <div className="grid gap-3 md:grid-cols-2">
                    <Input
                      nativeInput
                      onChange={(event) => setSshUsername(event.target.value)}
                      placeholder="SSH 用户名，通常是 git"
                      value={sshUsername}
                    />
                    <Input
                      nativeInput
                      onChange={(event) => setAuthUsername(event.target.value)}
                      placeholder="HTTPS 用户名（可选）"
                      value={authUsername}
                    />
                  </div>

                  <div className="flex gap-2">
                    <Input
                      className="flex-1"
                      nativeInput
                      onChange={(event) => setSshPrivateKeyPath(event.target.value)}
                      placeholder="选择或输入 SSH 私钥路径，例如 ~/.ssh/id_ed25519"
                      value={sshPrivateKeyPath}
                    />
                    <Button
                      disabled={actionBusy}
                      onClick={() => void pickSshPrivateKeyFile()}
                      variant="outline"
                    >
                      <FolderKey />
                      选择文件
                    </Button>
                  </div>

                  <div className="grid gap-3 md:grid-cols-2">
                    <Input
                      nativeInput
                      onChange={(event) => setSshPassphrase(event.target.value)}
                      placeholder="SSH 私钥口令（可选）"
                      type="password"
                      value={sshPassphrase}
                    />
                    <Input
                      nativeInput
                      onChange={(event) => setAuthPassword(event.target.value)}
                      placeholder="HTTPS Token / 密码（可选）"
                      type="password"
                      value={authPassword}
                    />
                  </div>
                </div>
              </TabsContent>
            </NativeDialogPanel>
          </Tabs>

          <NativeDialogFooter className="justify-between sm:justify-between">
            <div className="flex min-w-0 flex-1 items-center gap-2 text-xs text-muted-foreground">
              {busy || actionBusy ? (
                <LoaderCircle className="size-3.5 animate-spin" />
              ) : (
                <GitBranch className="size-3.5" />
              )}
              <span className="min-w-0 truncate">{statusTooltip}</span>
            </div>
            <div className="shrink-0 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button disabled={!canOperate} onClick={() => void refreshStatus()} variant="outline">
                <RefreshCw />
                刷新状态
              </Button>
              <Button
                disabled={!canOperate}
                loading={actionBusy}
                onClick={() => void pull()}
                variant="outline"
              >
                <ArrowDownToLine />
                拉取
              </Button>
              <Button
                disabled={!canOperate}
                loading={actionBusy}
                onClick={() => void push()}
                variant="outline"
              >
                <ArrowUpFromLine />
                推送
              </Button>
            </div>
          </NativeDialogFooter>
        </div>
      </NativeDialog>

      <NativeDialog
        open={pendingHistoryAction !== null}
        onOpenChange={(open) => !open && setPendingHistoryAction(null)}
        className="max-w-[min(640px,calc(100vw-2rem))]"
      >
        <div className="flex h-auto min-h-0 min-w-0 flex-col overflow-hidden">
          <NativeDialogHeader>
            <NativeDialogTitle>
              {pendingHistoryAction?.type === "undo-last" ? "撤销最近提交" : "回滚指定提交"}
            </NativeDialogTitle>
            <NativeDialogDescription>
              {pendingHistoryAction?.type === "undo-last"
                ? "会把最近一次提交从历史中移除，但保留改动到工作区。该操作只建议在还未推送时使用。"
                : `会创建一个新的回滚提交，用来撤销这次提交的效果：${pendingHistoryAction?.summary ?? ""}`}
            </NativeDialogDescription>
          </NativeDialogHeader>

          <NativeDialogPanel>
            {/* Empty panel - content is already in header/description */}
          </NativeDialogPanel>

          <NativeDialogFooter>
            <div className="flex w-full justify-end gap-2">
              <Button onClick={() => setPendingHistoryAction(null)} variant="outline">
                取消
              </Button>
              <Button
                loading={actionBusy}
                onClick={() => {
                  const action = pendingHistoryAction;
                  setPendingHistoryAction(null);

                  if (action?.type === "undo-last") {
                    void undoLastCommit();
                    return;
                  }

                  if (action?.type === "revert-commit") {
                    void revertHistoryCommit(action.commitId);
                  }
                }}
                variant={
                  pendingHistoryAction?.type === "undo-last" ? "destructive-outline" : "default"
                }
              >
                {pendingHistoryAction?.type === "undo-last" ? "确认撤销" : "确认回滚"}
              </Button>
            </div>
          </NativeDialogFooter>
        </div>
      </NativeDialog>
    </>
  );
}
