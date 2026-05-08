import { type ReactNode } from "react";
import { cn } from "@/lib/utils";

export function SettingsSectionCard({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-2xl border bg-card p-4 shadow-xs sm:p-5">
      <div className="space-y-1">
        <h3 className="text-sm font-semibold text-foreground sm:text-base">{title}</h3>
        <p className="text-xs text-muted-foreground sm:text-sm">{description}</p>
      </div>
      <div className="mt-4">{children}</div>
    </section>
  );
}

export function AboutStat({
  label,
  value,
}: {
  label: string;
  value: ReactNode;
}) {
  return (
    <div className="rounded-xl border border-border bg-background px-4 py-3">
      <div className="text-xs uppercase tracking-[0.16em] text-muted-foreground">{label}</div>
      <div className="mt-2 break-all text-sm font-medium text-foreground sm:text-base">{value}</div>
    </div>
  );
}

export function ThemeOption({
  active,
  description,
  label,
  onClick,
}: {
  active: boolean;
  description: string;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={cn(
        "rounded-xl border px-4 py-3 text-left transition-colors",
        active
          ? "border-primary bg-primary/8 text-foreground shadow-xs"
          : "border-border bg-background text-muted-foreground hover:bg-accent hover:text-foreground",
      )}
      onClick={onClick}
    >
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm font-medium">{label}</span>
        <div className="flex items-center gap-2">
          <span className={cn("size-2.5 rounded-full transition-colors", active ? "bg-primary" : "bg-border")} />
          {/* color swatch placeholder; actual color applied via --accent CSS var when used */}

        </div>
      </div>
      <p className="mt-1 text-xs leading-5">{description}</p>
    </button>
  );
}
