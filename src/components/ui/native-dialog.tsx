"use client";

import { XIcon } from "lucide-react";
import { useCallback, useEffect, useRef, type HTMLAttributes } from "react";
import type * as React from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";

const nativeDialogOpenAttr = "data-native-dialog-open";
const nativeDialogCountAttr = "data-native-dialog-count";
const nativeDialogScrollLockAttr = "data-native-dialog-scroll-lock";
const nativeDialogPrevOverflowAttr = "data-native-dialog-prev-overflow";

function lockNativeDialogScrollbars(dialog: HTMLDialogElement | null) {
  const root = document.documentElement;
  const currentCount = Number(root.getAttribute(nativeDialogCountAttr) ?? "0");

  root.setAttribute(nativeDialogOpenAttr, "true");
  root.setAttribute(nativeDialogCountAttr, String(currentCount + 1));

  if (currentCount === 0) {
    const scrollEls = document.querySelectorAll<HTMLElement>(
      `[${nativeDialogScrollLockAttr}]`,
    );

    scrollEls.forEach((el) => {
      if (dialog?.contains(el)) {
        return;
      }

      el.setAttribute(nativeDialogPrevOverflowAttr, el.style.overflow);
      el.style.overflow = "hidden";
    });
  }

  return () => {
    const nextCount = Math.max(
      0,
      Number(root.getAttribute(nativeDialogCountAttr) ?? "1") - 1,
    );

    if (nextCount === 0) {
      root.removeAttribute(nativeDialogOpenAttr);
      root.removeAttribute(nativeDialogCountAttr);

      const scrollEls = document.querySelectorAll<HTMLElement>(
        `[${nativeDialogScrollLockAttr}]`,
      );

      scrollEls.forEach((el) => {
        el.style.overflow = el.getAttribute(nativeDialogPrevOverflowAttr) ?? "";
        el.removeAttribute(nativeDialogPrevOverflowAttr);
      });

      return;
    }

    root.setAttribute(nativeDialogCountAttr, String(nextCount));
  };
}

export type NativeDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: React.ReactNode;
  className?: string;
};

export function NativeDialog({
  open,
  onOpenChange,
  children,
  className,
}: NativeDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const prevOverflowRef = useRef<string | null>(null);
  const prevBodyOverflowRef = useRef<string | null>(null);
  const releaseScrollLockRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (open && !dialog.open) {
      // hide document scrollbars while modal is open so the platform scrollbar
      // doesn't visually overlap the dialog
      try {
        prevOverflowRef.current = document.documentElement.style.overflow || "";
        prevBodyOverflowRef.current = document.body.style.overflow || "";
        document.documentElement.style.overflow = "hidden";
        document.body.style.overflow = "hidden";
        releaseScrollLockRef.current ??= lockNativeDialogScrollbars(dialog);
      } catch {}

      dialog.showModal();
      requestAnimationFrame(() => {
        const autofocusEl = dialog.querySelector<HTMLElement>("[autofocus]");
        if (autofocusEl) {
          autofocusEl.focus();
        }
      });
    } else if (!open && dialog.open) {
      if (document.activeElement instanceof HTMLElement) {
        document.activeElement.blur();
      }
      // restore document overflow
      try {
        if (prevOverflowRef.current !== null) {
          document.documentElement.style.overflow = prevOverflowRef.current;
        } else {
          document.documentElement.style.overflow = "";
        }

        if (prevBodyOverflowRef.current !== null) {
          document.body.style.overflow = prevBodyOverflowRef.current;
        } else {
          document.body.style.overflow = "";
        }

        releaseScrollLockRef.current?.();
        releaseScrollLockRef.current = null;
      } catch {}

      dialog.close();
    }
  }, [open]);

  const handleCancel = useCallback(
    (e: Event) => {
      e.preventDefault();
      if (document.activeElement instanceof HTMLElement) {
        document.activeElement.blur();
      }
      onOpenChange(false);
    },
    [onOpenChange],
  );

  const handleClose = useCallback(() => {
    onOpenChange(false);
  }, [onOpenChange]);

  const handleBackdropClick = useCallback(
    (e: React.MouseEvent<HTMLDialogElement>) => {
      if (e.target === dialogRef.current) {
        onOpenChange(false);
      }
    },
    [onOpenChange],
  );

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    dialog.addEventListener("cancel", handleCancel);
    return () => {
      dialog.removeEventListener("cancel", handleCancel);
      // cleanup overflow if dialog is unmounted while open
      try {
        if (prevOverflowRef.current !== null) {
          document.documentElement.style.overflow = prevOverflowRef.current;
          prevOverflowRef.current = null;
        }

        if (prevBodyOverflowRef.current !== null) {
          document.body.style.overflow = prevBodyOverflowRef.current;
          prevBodyOverflowRef.current = null;
        }

        releaseScrollLockRef.current?.();
        releaseScrollLockRef.current = null;
      } catch {}
    };
  }, [handleCancel]);

  return (
    <dialog
      ref={dialogRef}
      className={cn(
        "m-auto max-h-[85vh] min-h-0 w-full max-w-lg overflow-hidden rounded-2xl border bg-popover p-0 text-popover-foreground shadow-lg outline-none backdrop:bg-black/32 backdrop:backdrop-blur-sm",
        className,
      )}
      onClick={handleBackdropClick}
      onClose={handleClose}
    >
      {children}
    </dialog>
  );
}

export function NativeDialogHeader({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "flex flex-col gap-2 p-6 max-sm:pb-4",
        className,
      )}
      {...props}
    />
  );
}

export function NativeDialogTitle({
  className,
  ...props
}: HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h2
      className={cn(
        "font-heading font-semibold text-xl leading-none",
        className,
      )}
      {...props}
    />
  );
}

export function NativeDialogDescription({
  className,
  ...props
}: HTMLAttributes<HTMLParagraphElement>) {
  return (
    <p
      className={cn("text-muted-foreground text-sm", className)}
      {...props}
    />
  );
}

export function NativeDialogPanel({
  className,
  children,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <ScrollArea scrollFade>
      <div
        className={cn("p-6 pt-1", className)}
        {...props}
      >
        {children}
      </div>
    </ScrollArea>
  );
}

export function NativeDialogFooter({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "flex flex-col-reverse gap-2 px-6 sm:flex-row sm:justify-end rounded-b-[calc(var(--radius-2xl)-1px)] border-t bg-muted/72 py-4",
        className,
      )}
      {...props}
    />
  );
}

export function NativeDialogClose({
  onClick,
  ...props
}: React.ComponentProps<typeof Button>) {
  return (
    <Button size="icon" variant="ghost" onClick={onClick} {...props}>
      <XIcon />
    </Button>
  );
}
