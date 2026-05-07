import { Window } from "@tauri-apps/api/window";
import { X, Square, Minus } from "lucide-react";

import { SettingsDialog } from "@/components/system/settings-dialog";

const appWindow = new Window("main");

export default function Titlebar() {
  return (
    <div
      data-tauri-drag-region
      className="flex h-9 items-center justify-between border-b border-border bg-muted/80 text-foreground select-none"
    >
      <div className="flex items-center ml-4 gap-2 pointer-events-none">
        <span className="text-sm font-medium text-muted-foreground">Madora</span>
      </div>
      <div className="flex items-center h-full">
        <SettingsDialog />
        <button
          type="button"
          onClick={() => appWindow.minimize()}
          className="flex h-full items-center px-3 text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
        >
          <Minus size={14} />
        </button>
        <button
          type="button"
          onClick={() => appWindow.toggleMaximize()}
          className="flex h-full items-center px-3 text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
        >
          <Square size={12} />
        </button>
        <button
          type="button"
          onClick={() => appWindow.close()}
          className="group flex h-full items-center px-3 text-muted-foreground transition-colors hover:bg-red-500/80 hover:text-white"
        >
          <X size={14} className="group-hover:text-white" />
        </button>
      </div>
    </div>
  );
}
