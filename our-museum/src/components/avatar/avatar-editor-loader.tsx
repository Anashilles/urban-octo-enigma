"use client";

import dynamic from "next/dynamic";
import { Loader2Icon } from "lucide-react";
import type { AvatarConfig } from "@/features/avatars/config";
import { useT } from "@/i18n/client";

/** Keeps the page title and a status message available while the editor loads. */
function Loading() {
  const t = useT();
  return (
    <div className="grid min-h-[60vh] place-items-center text-muted-foreground">
      <h1 className="sr-only">{t("avatar.title")}</h1>
      <p role="status" className="flex items-center gap-2 text-sm">
        <Loader2Icon className="size-6 animate-spin" aria-hidden="true" />
        <span className="sr-only">{t("common.loading")}</span>
      </p>
    </div>
  );
}

// Client-only: the editor checks WebGL support and drives a three.js preview.
const AvatarEditor = dynamic(() => import("./AvatarEditor").then((m) => m.AvatarEditor), { ssr: false, loading: Loading });

export function AvatarEditorLoader(props: { initial: AvatarConfig; saved: boolean; returnTo: string | null }) {
  return <AvatarEditor {...props} />;
}
