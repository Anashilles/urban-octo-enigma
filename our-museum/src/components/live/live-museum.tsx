"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { useSceneRefresher } from "./use-scene-refresher";
import { PencilRulerIcon, UserRoundIcon } from "lucide-react";
import { HudIconButton } from "@/components/museum/Hud";
import { MuseumExperience } from "@/components/museum/MuseumExperience";
import { PlacementBar } from "@/components/museum/PlacementBar";
import { Button } from "@/components/ui/button";
import type { SceneData } from "@/features/museums/scene-types";
import { useT } from "@/i18n/client";
import { ApiError, api, errorKey } from "@/lib/api/client";
import { useMuseumStore } from "@/store/museum-store";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/controls";
import { usePreferences } from "@/store/preferences";
import { useRealtimeStore } from "@/store/realtime-store";
import { useVoiceStore } from "@/store/voice-store";
import { RemoteAvatars } from "@/three/avatars/RemoteAvatars";
import { PlacementTool, type PlacementConfirm } from "@/three/scenes/PlacementTool";
import { FloatingReactions, NameTags, PeopleSheet, TourBanner, PresenceButton, SharedBanner, ViewerLiveActions, ViewerSharedBar } from "./LiveUI";
import { useRealtime } from "./use-realtime";
import { useVoice } from "./use-voice";
import { VoiceButton, VoiceSection } from "./VoiceUI";
import type { VoiceManager } from "@/features/voice/voice-manager";

export default function LiveMuseum({ initialScene }: { initialScene: SceneData }) {
  const t = useT();
  const router = useRouter();
  const museumId = initialScene.museum.id;
  const refresh = useSceneRefresher(museumId);
  const scene = useMuseumStore((s) => s.scene);
  const placing = useMuseumStore((s) => Boolean(s.placement));
  const viewerSequence = useMuseumStore((s) => s.viewer?.sequence);
  const [hanging, setHanging] = useState(false);
  const voiceRef = useRef<VoiceManager | null>(null);
  const realtime = useRealtime(museumId, { selfUserId: initialScene.viewer.userId, refresh, enabled: true, voice: voiceRef });
  const voiceAllowed = initialScene.viewer.permissions["voice.join"] && initialScene.museum.privacy.voiceChatEnabled;
  const voice = useVoice(voiceRef, realtime, voiceAllowed);
  const shared = useRealtimeStore((s) => s.shared);
  const following = useRealtimeStore((s) => s.following);
  const selfId = useRealtimeStore((s) => s.selfId);
  const autoFollow = usePreferences((s) => s.autoFollowShared);
  const setPrefs = usePreferences((s) => s.set);
  const liveTour = useRealtimeStore((s) => s.tour);
  const online = useRealtimeStore((s) => s.status === "online");
  const isFollower = Boolean(shared && following && shared.leaderId !== selfId);
  const isLeader = Boolean(shared && following && shared.leaderId === selfId);

  useEffect(() => {
    useMuseumStore.getState().setScene(initialScene);
  }, [initialScene]);

  // Read-only state for end-to-end tests (NEXT_PUBLIC_ENABLE_TEST_HOOKS=true).
  useEffect(() => {
    if (process.env.NEXT_PUBLIC_ENABLE_TEST_HOOKS !== "true") return;
    (window as unknown as { __live?: unknown }).__live = {
      realtime: () => {
        const s = useRealtimeStore.getState();
        return { status: s.status, selfId: s.selfId, peers: Object.keys(s.peers).length, shared: s.shared, following: s.following };
      },
      viewer: () => useMuseumStore.getState().viewer,
      voice: () => {
        const v = useVoiceStore.getState();
        return { status: v.status, muted: v.muted, listenOnly: v.listenOnly, speaking: v.speaking, error: v.error, connected: v.connected };
      },
      tour: () => ({ local: useMuseumStore.getState().tour, live: useRealtimeStore.getState().tour }),
      peers: () => Object.values(useRealtimeStore.getState().peers).map((p) => ({ name: p.name, voice: p.voice, viewing: p.viewing })),
    };
  }, []);

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
  const perms = scene.viewer.permissions;

  return (
    <MuseumExperience
      exitHref="/dashboard"
      spawnSpread={0.9}
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
      worldExtras={
        <>
          {canEdit && <PlacementTool onConfirm={(p) => void hang(p)} />}
          <RemoteAvatars />
        </>
      }
      viewerActions={(photoId) => (
        <ViewerLiveActions
          photoId={photoId}
          sequence={viewerSequence ?? [photoId]}
          actions={realtime}
          canShare={perms["shared.start"]}
          canReact={perms["photo.react"] && scene.museum.privacy.reactionsEnabled}
        />
      )}
      sharedBanner={<ViewerSharedBar actions={realtime} />}
      viewerLocked={isFollower}
      viewerSyncedView={isFollower && shared ? { zoom: shared.zoom, panX: shared.panX, panY: shared.panY } : null}
      onViewerViewChange={isLeader ? realtime.onViewChange : undefined}
      onViewerNavigate={realtime.onViewerNavigate}
      onViewerClose={realtime.onViewerClose}
      viewerOverlay={(photoId) => <FloatingReactions photoId={photoId} />}
      tourHooks={{
        onLead: realtime.leadTour,
        canLead: perms["tour.present"] && online,
        onStep: realtime.stepTour,
        onEnd: realtime.endTour,
        guideName: liveTour?.leaderName ?? null,
      }}
      settingsExtra={
        <>
          <div className="flex items-start justify-between gap-4">
            <div className="grid gap-1">
              <Label htmlFor="auto-follow" className="text-ivory/90">
                {t("museum.live.autoFollow")}
              </Label>
              <p className="text-xs text-ivory/55">{t("museum.live.autoFollowHint")}</p>
            </div>
            <Switch id="auto-follow" checked={autoFollow} onCheckedChange={(v) => setPrefs({ autoFollowShared: v })} />
          </div>
          <Button asChild variant="glass" className="w-full" data-testid="settings-edit-avatar">
            <Link href={`/avatar?returnTo=${encodeURIComponent(`/museum/${museumId}`)}`}>
              <UserRoundIcon aria-hidden="true" />
              {t("nav.avatar")}
            </Link>
          </Button>
        </>
      }
      toolbar={
        <>
          {voiceAllowed && <VoiceButton voice={voice} />}
          <PresenceButton />
          {canEdit && (
            <HudIconButton label={t("museum.hud.edit")} onClick={() => router.push(`/editor/${museumId}`)} testId="hud-edit">
              <PencilRulerIcon />
            </HudIconButton>
          )}
        </>
      }
      overlays={
        <>
          {canEdit && <PlacementBar scene={scene} busy={hanging} />}
          <NameTags scene={scene} />
          <SharedBanner scene={scene} actions={realtime} />
          <TourBanner scene={scene} actions={realtime} />
          <PeopleSheet scene={scene} actions={realtime} voiceSection={<VoiceSection voice={voice} enabled={voiceAllowed} />} />
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
