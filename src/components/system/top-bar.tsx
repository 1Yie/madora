import { Window } from "@tauri-apps/api/window";
import { X, Square, Minus, Sparkles, Moon, Sun } from "lucide-react";

import { useTheme } from "@/components/system/theme-provider";

const appWindow = new Window("main");

export default function Titlebar() {
  const { theme, toggleTheme } = useTheme();

  return (
    <div
      data-tauri-drag-region
      className="flex h-9 items-center justify-between border-b border-border bg-muted/80 text-foreground select-none"
    >
      <div className="flex items-center ml-4 gap-2 pointer-events-none">
        <Sparkles size={14} className="text-primary" />
        <span className="text-sm font-medium text-muted-foreground">Madora</span>
      </div>
      <div className="flex items-center h-full">
        <button
          type="button"
          aria-label={theme === "dark" ? "切换到浅色主题" : "切换到深色主题"}
          aria-pressed={theme === "dark"}
          title={theme === "dark" ? "切换到浅色主题" : "切换到深色主题"}
          onClick={toggleTheme}
          className="flex h-full items-center px-3 text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
        >
          {theme === "dark" ? <Sun size={14} /> : <Moon size={14} />}
        </button>
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
