"use client";

import * as React from "react";
import { Label as LabelPrimitive } from "radix-ui";
import { cn } from "@/lib/utils";

/**
 * Labels for a control get the id `${htmlFor}-label`, so widgets that are not
 * native form fields (e.g. the slider thumb) can point at them with aria-labelledby.
 */
function Label({ className, id, htmlFor, ...props }: React.ComponentProps<typeof LabelPrimitive.Root>) {
  return (
    <LabelPrimitive.Root
      id={id ?? (htmlFor ? `${htmlFor}-label` : undefined)}
      htmlFor={htmlFor}
      data-slot="label"
      className={cn(
        "flex items-center gap-2 text-sm leading-none font-medium select-none group-data-[disabled=true]:opacity-50 peer-disabled:cursor-not-allowed peer-disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
}

export { Label };
