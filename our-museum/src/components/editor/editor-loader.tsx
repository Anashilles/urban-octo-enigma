"use client";

import dynamic from "next/dynamic";
import { Suspense } from "react";
import type { SceneData } from "@/features/museums/scene-types";
import { MuseumLoading } from "@/components/museum/MuseumLoading";

const EditorShell = dynamic(() => import("./EditorShell"), { ssr: false, loading: () => <MuseumLoading /> });

export function EditorLoader({ initialScene, maxUploadBytes }: { initialScene: SceneData; maxUploadBytes: number }) {
  return (
    <Suspense fallback={<MuseumLoading />}>
      <EditorShell initialScene={initialScene} maxUploadBytes={maxUploadBytes} />
    </Suspense>
  );
}
