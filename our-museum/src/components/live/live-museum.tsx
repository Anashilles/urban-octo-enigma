"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useSceneRefresher } from "./use-scene-refresher";
import { PencilRulerIcon } from "lucide-react";
import { HudIconButton } from "@/components/museum/Hud";
import { MuseumExperience } from "@/components/museum/MuseumExperience";
import { Button } from "@/components/ui/button";
import type { SceneData } from "@/features/museums/scene-types";
import { useT } from "@/i18n/client";
import { useMuseumStore } from "@/store/museum-store";

export default function LiveMuseum({ initialScene }: { initialScene: SceneData }) {
  const t = useT();
  const router = useRouter();
  const museumId = initialScene.museum.id;
  const refresh = useSceneRefresher(museumId);
  const scene = useMuseumStore((s) => s.scene);

  useEffect(() => {
    useMuseumStore.getState().setScene(initialScene);
  }, [initialScene]);

  // Refresh signed photo URLs a few minutes before they expire.
  useEffect(() => {
    const expires = scene?.urlsExpireAt ? new Date(scene.urlsExpireAt).getTime() : 0;
    if (!expires) return;
    const timer = window.setTimeout(refresh, Math.max(30_000, expires - Date.now() - 3 * 60_000));
    return () => window.clearTimeout(timer);
  }, [scene?.urlsExpireAt, refresh]);

  if (!scene || scene.museum.id !== museumId) return null;
  const canEdit = scene.viewer.permissions["frame.place"];

  return (
    <MuseumExperience
      exitHref="/dashboard"
      showInviteHint={scene.viewer.permissions["invitation.manage"]}
      onPhotoTextureError={refresh}
      toolbar={
        canEdit ? (
          <HudIconButton label={t("museum.hud.edit")} onClick={() => router.push(`/editor/${museumId}`)} testId="hud-edit">
            <PencilRulerIcon />
          </HudIconButton>
        ) : null
      }
      overlays={
        scene.frames.length === 0 && canEdit ? (
          <div className="pointer-events-none absolute inset-x-0 bottom-24 z-20 flex justify-center px-4">
            <div className="glass-dark pointer-events-auto flex items-center gap-3 rounded-2xl border border-white/10 p-3 ps-5 text-sm text-ivory">
              <span>{t("dashboard.onboarding.hang")}</span>
              <Button asChild size="sm" variant="gold">
                <Link href={`/editor/${museumId}?tab=photos`}>{t("museum.hud.edit")}</Link>
              </Button>
            </div>
          </div>
        ) : null
      }
    />
  );
}
