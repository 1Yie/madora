"use client";

import { ContextMenu as ContextMenuPrimitive } from "@base-ui/react/context-menu";
import type React from "react";

import {
  MenuCheckboxItem,
  MenuGroup,
  MenuGroupLabel,
  MenuItem,
  MenuPopup,
  MenuPortal,
  MenuRadioGroup,
  MenuRadioItem,
  MenuSeparator,
  MenuShortcut,
  MenuSub,
  MenuSubPopup,
  MenuSubTrigger,
} from "@/components/ui/menu";

export const ContextMenuRoot: typeof ContextMenuPrimitive.Root = ContextMenuPrimitive.Root;

export function ContextMenuTrigger(
  props: ContextMenuPrimitive.Trigger.Props,
): React.ReactElement {
  return <ContextMenuPrimitive.Trigger data-slot="context-menu-trigger" {...props} />;
}

export function ContextMenuPopup(
  props: React.ComponentProps<typeof MenuPopup>,
): React.ReactElement {
  return <MenuPopup {...props} />;
}

export {
  ContextMenuPrimitive,
  MenuPortal as ContextMenuPortal,
  MenuItem,
  MenuCheckboxItem,
  MenuRadioGroup,
  MenuRadioItem,
  MenuGroup,
  MenuGroupLabel,
  MenuSeparator,
  MenuShortcut,
  MenuSub,
  MenuSubTrigger,
  MenuSubPopup,
};
