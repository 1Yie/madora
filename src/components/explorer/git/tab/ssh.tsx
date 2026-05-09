import { FolderKey } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type GitTabSshProps = {
  actionBusy: boolean;
  authPassword: string;
  authUsername: string;
  sshPassphrase: string;
  sshPrivateKeyPath: string;
  sshUsername: string;
  onAuthPasswordChange: (v: string) => void;
  onAuthUsernameChange: (v: string) => void;
  onPickKeyFile: () => void;
  onSshPassphraseChange: (v: string) => void;
  onSshPrivateKeyPathChange: (v: string) => void;
  onSshUsernameChange: (v: string) => void;
};

export function GitTabSsh({
  actionBusy,
  authPassword,
  authUsername,
  sshPassphrase,
  sshPrivateKeyPath,
  sshUsername,
  onAuthPasswordChange,
  onAuthUsernameChange,
  onPickKeyFile,
  onSshPassphraseChange,
  onSshPrivateKeyPathChange,
  onSshUsernameChange,
}: GitTabSshProps) {
  return (
    <div className="space-y-4">
      <div>
        <div className="text-base font-medium text-foreground">SSH / HTTPS 认证</div>
        <p className="mt-1 text-xs text-muted-foreground">默认优先使用 SSH Agent。</p>
        <p className="mt-1 text-xs text-muted-foreground">
          这里可以补充 SSH 私钥路径、SSH 用户名，或者 HTTPS 的用户名和 Token。
        </p>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <Input
          nativeInput
          onChange={(event) => onSshUsernameChange(event.target.value)}
          placeholder="SSH 用户名，通常是 git"
          value={sshUsername}
        />
        <Input
          nativeInput
          onChange={(event) => onAuthUsernameChange(event.target.value)}
          placeholder="HTTPS 用户名（可选）"
          value={authUsername}
        />
      </div>

      <div className="flex gap-2">
        <Input
          className="flex-1"
          nativeInput
          onChange={(event) => onSshPrivateKeyPathChange(event.target.value)}
          placeholder="选择或输入 SSH 私钥路径，例如 ~/.ssh/id_ed25519"
          value={sshPrivateKeyPath}
        />
        <Button disabled={actionBusy} onClick={onPickKeyFile} variant="outline">
          <FolderKey />
          选择文件
        </Button>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <Input
          nativeInput
          onChange={(event) => onSshPassphraseChange(event.target.value)}
          placeholder="SSH 私钥口令（可选）"
          type="password"
          value={sshPassphrase}
        />
        <Input
          nativeInput
          onChange={(event) => onAuthPasswordChange(event.target.value)}
          placeholder="HTTPS Token / 密码（可选）"
          type="password"
          value={authPassword}
        />
      </div>
    </div>
  );
}
