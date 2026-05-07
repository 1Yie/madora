"use client";

import { ScrollArea as ScrollAreaPrimitive } from "@base-ui/react/scroll-area";
import type React from "react";
import { cn } from "@/lib/utils";

export function ScrollArea({
  className,
  children,
  scrollFade = false,
  scrollbarGutter = false,
  fadeClassName,
  ...props
}: ScrollAreaPrimitive.Root.Props & {
  scrollFade?: boolean;
  scrollbarGutter?: boolean;
  fadeClassName?: string;
}): React.ReactElement {
  return (
    <ScrollAreaPrimitive.Root
      className={cn("size-full min-h-0 relative", className)}
      {...props}
    >
      <ScrollAreaPrimitive.Viewport
        className={cn(
          "h-full rounded-[inherit] outline-none will-change-transform",
          "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background",
          "data-has-overflow-y:overscroll-y-contain data-has-overflow-x:overscroll-x-contain",
          scrollbarGutter && "data-has-overflow-y:pe-2.5 data-has-overflow-x:pb-2.5",
        )}
        data-slot="scroll-area-viewport"
      >
        {children}
      </ScrollAreaPrimitive.Viewport>
      {scrollFade && (
        <>
          <div className={cn("pointer-events-none absolute inset-x-0 top-0 h-6 bg-gradient-to-b from-popover to-transparent", fadeClassName)} />
          <div className={cn("pointer-events-none absolute inset-x-0 bottom-0 h-6 bg-gradient-to-t from-popover to-transparent", fadeClassName)} />
        </>
      )}
      <ScrollBar orientation="vertical" />
      <ScrollBar orientation="horizontal" />
      <ScrollAreaPrimitive.Corner data-slot="scroll-area-corner" />
    </ScrollAreaPrimitive.Root>
  );
}

export function ScrollBar({
  className,
  orientation = "vertical",
  ...props
}: ScrollAreaPrimitive.Scrollbar.Props): React.ReactElement {
  return (
    <ScrollAreaPrimitive.Scrollbar
      className={cn(
        "m-1 flex opacity-0 transition-opacity delay-300",
        "data-[orientation=horizontal]:h-1.5 data-[orientation=vertical]:w-1.5",
        "data-[orientation=horizontal]:flex-col",
        "data-hovering:opacity-100 data-scrolling:opacity-100",
        "data-hovering:delay-0 data-scrolling:delay-0",
        "data-hovering:duration-100 data-scrolling:duration-100",
        className,
      )}
      data-slot="scroll-area-scrollbar"
      orientation={orientation}
      {...props}
    >
      <ScrollAreaPrimitive.Thumb
        className="relative flex-1 rounded-full bg-border"
        data-slot="scroll-area-thumb"
      />
    </ScrollAreaPrimitive.Scrollbar>
  );
}

export { ScrollAreaPrimitive };