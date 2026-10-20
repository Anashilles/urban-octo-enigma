"use client";

import { Toaster as Sonner, type ToasterProps } from "sonner";

export function Toaster({ dir, ...props }: ToasterProps) {
  return (
    <Sonner
      dir={dir}
      position={dir === "rtl" ? "bottom-left" : "bottom-right"}
      toastOptions={{
        classNames: {
          toast: "!rounded-xl !border-border !bg-card !text-foreground !shadow-xl font-sans",
          description: "!text-muted-foreground",
        },
      }}
      {...props}
    />
  );
}
