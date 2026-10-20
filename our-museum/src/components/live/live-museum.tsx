"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { useSceneRefresher } from "./use-scene-refresher";
import { PencilRulerIcon } from "lucide-react";
import { HudIconButton } from "@/components/museum/Hud";
import { MuseumExperience } from "@/components/museum/MuseumExperience";
import { PlacementBar } from "@/components/museum/PlacementBar";
import { Button } from "@/components/ui/button";
import type { SceneData } from "@/features/museums/scene-types";
import { useT } from "@/i18n/client";
import { ApiError, api, errorKey } from "@/lib/api/client";
import { useMuseumStore } from "@/store/museum-store";
import { PlacementTool, type PlacementConfirm } from "@/three/scenes/PlacementTool";

export default function LiveMuseum({ initialScene }: { initialScene: SceneData }) {
  const t = useT();
  const router = useRouter();
  const museumId = initialScene.museum.id;
  const refresh = useSceneRefresher(museumId);
  const scene = useMuseumStore((s) => s.scene);
  const placing = useMuseumStore((s) => Boolean(s.placement));
  const [hanging, setHanging] = useState(false);

  useEffect(() => {
    useMuseumStore.getState().setScene(initialScene);
  }, [initialScene]);

  // Never carry a half-finished placement into another museum or page.
  useEffect(() => () => useMuseumStore.getState().setPlacement(null), []);

  // Refresh signed photo URLs a few minutes before they expire.
  useEffect(() => {
    const expires = scene?.urlsExpireAt ? new Date(scene.urlsExpireAt).getTime() : 0;
    if (!expires) return;
    const timer = window.setTimeout(refresh, Math.max(30_000, expires - Date.now() - 3 * 60_000));
    return () => window.clearTimeout(timer);
  }, [scene?.urlsExpireAt, refresh]);

  const errorText = useCallback(
    (e: unknown) => {
      if (e instanceof ApiError && e.code === "PLACEMENT_INVALID") {
        const problem = (e.details as { problem?: string } | undefined)?.problem;
        if (problem) return t(`editor.walls.problems.${problem}` as "editor.walls.problems.out_of_bounds");
      }
      if (e instanceof ApiError && e.code === "FORBIDDEN") return t("museum.placement.noPermission");
      return t(errorKey(e));
    },
    [t],
  );

  const hang = useCallback(
    async (p: PlacementConfirm) => {
      const s = useMuseumStore.getState();
      if (hanging || !s.scene) return;
      setHanging(true);
      try {
        await api(`/api/museums/${museumId}/frames`, {
          method: "POST",
          body: { ...p, rotation: 0, style: s.scene.theme.defaultFrameStyle },
        });
        await refresh();
        s.setPlacement(null);
        toast.success(t("museum.placement.placed"));
      } catch (e) {
        toast.error(errorText(e));
      } finally {
        setHanging(false);
      }
    },
    [hanging, museumId, refresh, t, errorText],
  );

  const toggleFavorite = useCallback(
    async (photoId: string, favorite: boolean) => {
      // Optimistic: flip the heart immediately, then reconcile with the server.
      useMuseumStore.getState().patchScene((s) => ({ ...s, photos: s.photos.map((p) => (p.id === photoId ? { ...p, favorite } : p)) }));
      try {
        await api(`/api/museums/${museumId}/photos/${photoId}/favorite`, { method: "PUT", body: { favorite } });
      } catch (e) {
        toast.error(t(errorKey(e)));
        await refresh();
      }
    },
    [museumId, refresh, t],
  );

  if (!scene || scene.museum.id !== museumId) return null;
  const canEdit = scene.viewer.permissions["frame.place"];

  return (
    <MuseumExperience
      exitHref="/dashboard"
      showInviteHint={scene.viewer.permissions["invitation.manage"]}
      onPhotoTextureError={refresh}
      onToggleFavorite={(photoId, favorite) => void toggleFavorite(photoId, favorite)}
      onPlacePhoto={
        canEdit
          ? (photoId) => {
              const s = useMuseumStore.getState();
              s.setPanel(null);
              s.setPlacement({ photoId, scale: 1, preview: null });
            }
          : undefined
      }
      worldExtras={canEdit ? <PlacementTool onConfirm={(p) => void hang(p)} /> : null}
      toolbar={
        canEdit ? (
          <HudIconButton label={t("museum.hud.edit")} onClick={() => router.push(`/editor/${museumId}`)} testId="hud-edit">
            <PencilRulerIcon />
          </HudIconButton>
        ) : null
      }
      overlays={
        <>
          {canEdit && <PlacementBar scene={scene} busy={hanging} />}
          {scene.frames.length === 0 && canEdit && !placing && (
            <div className="pointer-events-none absolute inset-x-0 bottom-24 z-20 flex justify-center px-4">
              <div className="glass-dark pointer-events-auto flex items-center gap-3 rounded-2xl border border-white/10 p-3 ps-5 text-sm text-ivory">
                <span>{t("dashboard.onboarding.hang")}</span>
                <Button asChild size="sm" variant="gold">
                  <Link href={`/editor/${museumId}?tab=photos`}>{t("museum.hud.edit")}</Link>
                </Button>
              </div>
            </div>
          )}
        </>
      }
    />
  );
}
