"use client";

import Link from "next/link";
import { ArrowLeftIcon, MonitorOffIcon, RefreshCwIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { SceneData } from "@/features/museums/scene-types";
import { useI18n } from "@/i18n/client";
import { useMuseumStore } from "@/store/museum-store";
import { PhotoList } from "./PhotoList";
import { PhotoViewer } from "./PhotoViewer";

/** Conventional gallery shown when the browser cannot render WebGL. */
export function WebGLFallback({ scene, exitHref, onRetry }: { scene: SceneData; exitHref: string; onRetry: () => void }) {
  const { t, dir } = useI18n();
  const viewer = useMuseumStore((s) => s.viewer);
  const { openViewer, closeViewer } = useMuseumStore.getState();
  const photos = new Map(scene.photos.map((p) => [p.id, p]));
  return (
    <main id="main" className="min-h-dvh bg-background" data-testid="webgl-fallback">
      <div className="mx-auto max-w-3xl px-5 py-10 sm:px-8">
        <Button asChild variant="ghost" size="sm">
          <Link href={exitHref}>
            <ArrowLeftIcon className={dir === "rtl" ? "rotate-180" : ""} aria-hidden="true" />
            {t("common.back")}
          </Link>
        </Button>
        <div className="mt-6 flex items-start gap-4 rounded-2xl border border-border bg-card p-6">
          <MonitorOffIcon className="mt-1 size-6 shrink-0 text-gold-deep" aria-hidden="true" />
          <div className="grid gap-2">
            <h1 className="font-display text-3xl">{t("museum.fallback.title")}</h1>
            <p className="text-muted-foreground">{t("museum.fallback.body")}</p>
            <Button variant="outline" size="sm" className="justify-self-start" onClick={onRetry}>
              <RefreshCwIcon aria-hidden="true" />
              {t("museum.fallback.tryAgain")}
            </Button>
          </div>
        </div>
        <h2 className="mt-10 font-display text-4xl">{scene.museum.name}</h2>
        <div className="mt-6">
          <PhotoList scene={scene} onView={(photoId, sequence) => openViewer({ photoId, frameId: null, sequence, shared: false })} />
        </div>
      </div>
      {viewer && (
        <PhotoViewer photos={photos} sequence={viewer.sequence} photoId={viewer.photoId} shared={false} onNavigate={(photoId) => useMuseumStore.setState({ viewer: { ...viewer, photoId } })} onClose={closeViewer} />
      )}
    </main>
  );
}
