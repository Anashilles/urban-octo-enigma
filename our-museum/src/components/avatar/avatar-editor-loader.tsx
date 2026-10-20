"use client";

import dynamic from "next/dynamic";
import { Loader2Icon } from "lucide-react";
import type { AvatarConfig } from "@/features/avatars/config";

// Client-only: the editor checks WebGL support and drives a three.js preview.
const AvatarEditor = dynamic(() => import("./AvatarEditor").then((m) => m.AvatarEditor), {
  ssr: false,
  loading: () => (
    <div className="grid min-h-[60vh] place-items-center text-muted-foreground">
      <Loader2Icon className="size-6 animate-spin" aria-hidden="true" />
    </div>
  ),
});

export function AvatarEditorLoader(props: { initial: AvatarConfig; saved: boolean; returnTo: string | null }) {
  return <AvatarEditor {...props} />;
}
