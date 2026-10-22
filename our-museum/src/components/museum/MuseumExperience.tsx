"use client";

import { useCallback, useMemo, useState, type ReactNode } from "react";
import { toast } from "sonner";
import type { SceneData } from "@/features/museums/scene-types";
import { WALL_KEYS } from "@/features/rooms/geometry";
import { useT } from "@/i18n/client";
import { useInputBlock, useMuseumStore } from "@/store/museum-store";
import { usePreferences } from "@/store/preferences";
import { LocalAvatar } from "@/three/avatars/LocalAvatar";
import { emitLocalGesture } from "@/three/runtime";
import { GuideArrow } from "@/three/scenes/GuideArrow";
import { MuseumCanvas, detectWebGL, useEffectiveQuality } from "@/three/scenes/MuseumCanvas";
import { MuseumWorld } from "@/three/scenes/MuseumWorld";
import { ControlsTutorial } from "./ControlsTutorial";
import { Hud, toggleFullscreen, useIsCoarse } from "./Hud";
import { MobileControls } from "./MobileControls";
import { goToFrame, returnToSavedPose } from "./navigation";
import { PhotoList } from "./PhotoList";
import { ChangePictureButton, type UploadPhoto } from "./AddPhoto";
import { PhotosPanel } from "./PhotosPanel";
import { PhotoViewer, type SharedView } from "./PhotoViewer";
import { AmbientAudio } from "./AmbientAudio";
import { SettingsSheet } from "./SettingsSheet";
import { ToursPanel, TourCard, type TourHooks } from "./ToursUI";
import { WebGLFallback } from "./WebGLFallback";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";

/** Photos in walking order: rooms by sort order, walls clockwise, frames left→right. */
export function walkingOrder(scene: SceneData): string[] {
  const order: string[] = [];
  for (const room of [...scene.rooms].sort((a, b) => a.sortOrder - b.sortOrder)) {
    for (const wall of WALL_KEYS) {
      for (const f of scene.frames.filter((x) => x.roomId === room.id && x.wallKey === wall).sort((a, b) => a.u - b.u)) {
        if (!order.includes(f.photoId)) order.push(f.photoId);
      }
    }
  }
  return order;
}

export interface MuseumExperienceProps {
  exitHref: string;
  badge?: ReactNode;
  status?: ReactNode;
  toolbar?: ReactNode;
  /** Extra R3F content (avatars, remote visitors, placement preview). */
  worldExtras?: ReactNode;
  /** Extra HTML overlays (placement bar, voice controls, presence toasts). */
  overlays?: ReactNode;
  viewerActions?: (photoId: string) => ReactNode;
  sharedBanner?: ReactNode;
  settingsExtra?: ReactNode;
  showInviteHint?: boolean;
  onPlacePhoto?: (photoId: string) => void;
  /** Adds a photo from the visitor's device; see UploadPhoto. */
  onUploadPhoto?: UploadPhoto;
  /** Hangs another photo in an existing frame; resolves to whether it worked. */
  onChangeFramePhoto?: (frameId: string, photoId: string) => Promise<boolean>;
  onToggleFavorite?: (photoId: string, favorite: boolean) => void;
  onViewerNavigate?: (photoId: string) => void;
  onViewerClose?: () => void;
  onPhotoTextureError?: () => void;
  /** Disable pointer lock (e.g. while placing a photo with a visible cursor). */
  allowPointerLock?: boolean;
  /** Sideways randomisation of the spawn point (shared museums). */
  spawnSpread?: number;
  /** Shared viewing: followers can't navigate; their view mirrors the leader's. */
  viewerLocked?: boolean;
  viewerSyncedView?: SharedView | null;
  onViewerViewChange?: (view: SharedView) => void;
  viewerOverlay?: (photoId: string) => ReactNode;
  /** Side panel inside the photo viewer (comments). */
  viewerAside?: (photoId: string) => ReactNode;
  onViewerEscape?: (e: KeyboardEvent) => void;
  /** Live museums: lead tours for everyone and follow a guide. */
  tourHooks?: TourHooks;
}

export function MuseumExperience(props: MuseumExperienceProps) {
  const t = useT();
  const scene = useMuseumStore((s) => s.scene);
  const viewer = useMuseumStore((s) => s.viewer);
  const panel = useMuseumStore((s) => s.panel);
  const focusedFrameId = useMuseumStore((s) => s.focusedFrameId);
  const { openViewer, closeViewer, setPanel, setGuide } = useMuseumStore.getState();
  const tutorialSeen = usePreferences((s) => s.tutorialSeen);
  const setPrefs = usePreferences((s) => s.set);
  const [quality] = useEffectiveQuality();
  const coarse = useIsCoarse();
  // This component only renders on the client (loaded with ssr: false).
  const [webgl, setWebgl] = useState(() => detectWebGL());
  const [listOpen, setListOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  // First visit shows the tutorial once; the Help button reopens it.
  const tutorialOpen = helpOpen || panel === "help" || !tutorialSeen;
  useInputBlock(tutorialOpen || listOpen);

  const photos = useMemo(() => new Map((scene?.photos ?? []).map((p) => [p.id, p])), [scene?.photos]);
  const order = useMemo(() => (scene ? walkingOrder(scene) : []), [scene]);

  const openFrame = useCallback(
    (frameId: string) => {
      const s = useMuseumStore.getState().scene;
      const frame = s?.frames.find((f) => f.id === frameId);
      if (!s || !frame) return;
      openViewer({ photoId: frame.photoId, frameId, sequence: walkingOrder(s), shared: false });
    },
    [openViewer],
  );

  const onShortcut = useCallback(
    (code: string) => {
      if (code === "KeyF") toggleFullscreen();
      else if (code === "KeyC") {
        const p = usePreferences.getState();
        p.set({ cameraMode: p.cameraMode === "first" ? "third" : "first" });
      } else if (code === "KeyH" || code === "Slash") setHelpOpen(true);
      else if (code === "KeyP") setPanel("collections");
      else if (code === "KeyG") emitLocalGesture("wave");
    },
    [setPanel],
  );

  if (!scene) return null;
  if (!webgl) return <WebGLFallback scene={scene} exitHref={props.exitHref} onRetry={() => setWebgl(detectWebGL())} />;

  const viewerPhotoId = viewer?.photoId;
  // The frame being looked at: the one the viewer opened on, or wherever this photo hangs after browsing.
  const viewerFrameId = viewerPhotoId
    ? (scene.frames.find((f) => f.id === viewer?.frameId && f.photoId === viewerPhotoId) ?? scene.frames.find((f) => f.photoId === viewerPhotoId))?.id
    : undefined;

  return (
    <div className="fixed inset-0 overflow-hidden bg-ink" data-testid="museum-experience">
      <MuseumCanvas quality={quality} className="absolute inset-0 size-full touch-none outline-none" label={t("museum.canvasLabel")}>
        <MuseumWorld
          scene={scene}
          quality={quality}
          onInteractFrame={openFrame}
          onShortcut={onShortcut}
          allowPointerLock={props.allowPointerLock ?? !coarse}
          spawnSpread={props.spawnSpread}
          onPhotoTextureError={props.onPhotoTextureError}
        >
          <GuideArrow scene={scene} onArrive={() => toast(t("museum.guide.arrived"))} />
          <LocalAvatar config={scene.viewer.avatar} />
          {props.worldExtras}
        </MuseumWorld>
      </MuseumCanvas>

      <Hud
        scene={scene}
        exitHref={props.exitHref}
        onOpenFrame={openFrame}
        onReturn={returnToSavedPose}
        toolbar={props.toolbar}
        status={props.status}
        badge={props.badge}
      />

      {coarse && !viewer && <MobileControls canInteract={Boolean(focusedFrameId)} onInteract={() => focusedFrameId && openFrame(focusedFrameId)} />}

      <GuideBanner scene={scene} />
      <AmbientAudio />
      <TourCard scene={scene} hooks={props.tourHooks ?? {}} onView={openFrame} />
      <ToursPanel scene={scene} hooks={props.tourHooks ?? {}} />

      {props.overlays}

      <PhotosPanel
        scene={scene}
        open={panel === "collections"}
        onClose={() => setPanel(null)}
        onView={(photoId, sequence) => openViewer({ photoId, frameId: scene.frames.find((f) => f.photoId === photoId)?.id ?? null, sequence, shared: false })}
        onLocate={(frameId) => {
          setGuide(frameId);
          setPanel(null);
        }}
        onGoTo={(frameId) => {
          goToFrame(scene, frameId);
          setPanel(null);
        }}
        onPlace={props.onPlacePhoto}
        onUpload={props.onUploadPhoto}
        onToggleFavorite={props.onToggleFavorite}
      />

      <SettingsSheet
        open={panel === "settings"}
        onClose={() => setPanel(null)}
        onShowList={() => {
          setPanel(null);
          setListOpen(true);
        }}
        extra={props.settingsExtra}
      />

      <Sheet open={listOpen} onOpenChange={setListOpen}>
        <SheetContent side="end" closeLabel={t("common.close")} className="overflow-y-auto">
          <SheetHeader>
            <SheetTitle>{t("museum.list.title")}</SheetTitle>
            <SheetDescription>{t("museum.list.description")}</SheetDescription>
          </SheetHeader>
          <div className="px-5 pb-8">
            <PhotoList
              scene={scene}
              onView={(photoId, sequence) => {
                setListOpen(false);
                openViewer({ photoId, frameId: null, sequence, shared: false });
              }}
              onGoTo={(frameId) => {
                setListOpen(false);
                goToFrame(scene, frameId);
              }}
            />
          </div>
        </SheetContent>
      </Sheet>

      <ControlsTutorial
        open={tutorialOpen}
        coarse={coarse}
        showInvite={Boolean(props.showInviteHint)}
        onClose={() => {
          setHelpOpen(false);
          if (useMuseumStore.getState().panel === "help") setPanel(null);
          setPrefs({ tutorialSeen: true });
        }}
      />

      {viewer && viewerPhotoId && (
        <PhotoViewer
          photos={photos}
          sequence={viewer.sequence.length ? viewer.sequence : order}
          photoId={viewerPhotoId}
          shared={viewer.shared}
          onNavigate={(photoId) => {
            useMuseumStore.setState({ viewer: { ...viewer, photoId } });
            props.onViewerNavigate?.(photoId);
          }}
          onClose={() => {
            closeViewer();
            props.onViewerClose?.();
          }}
          actions={
            <>
              {props.viewerActions?.(viewerPhotoId)}
              {props.onChangeFramePhoto && viewerFrameId && (
                <ChangePictureButton
                  frameId={viewerFrameId}
                  currentPhotoId={viewerPhotoId}
                  photos={scene.photos}
                  onUpload={props.onUploadPhoto}
                  onChange={async (frameId, photoId) => {
                    const ok = await props.onChangeFramePhoto!(frameId, photoId);
                    // Keep looking at the same frame, now showing the new photo.
                    const v = useMuseumStore.getState().viewer;
                    if (ok && v) {
                      const sequence = [...new Set(v.sequence.map((id) => (id === viewerPhotoId ? photoId : id)))];
                      useMuseumStore.setState({ viewer: { ...v, photoId, frameId, sequence } });
                    }
                    return ok;
                  }}
                />
              )}
            </>
          }
          sharedBanner={props.sharedBanner}
          navigationLocked={props.viewerLocked}
          syncedView={props.viewerSyncedView}
          onViewChange={props.onViewerViewChange}
          overlay={props.viewerOverlay?.(viewerPhotoId)}
          aside={props.viewerAside?.(viewerPhotoId)}
          onEscapeKeyDown={props.onViewerEscape}
        />
      )}
    </div>
  );
}

function GuideBanner({ scene }: { scene: SceneData }) {
  const t = useT();
  const guideFrameId = useMuseumStore((s) => s.guideFrameId);
  const setGuide = useMuseumStore((s) => s.setGuide);
  if (!guideFrameId) return null;
  const frame = scene.frames.find((f) => f.id === guideFrameId);
  const photo = frame ? scene.photos.find((p) => p.id === frame.photoId) : null;
  return (
    <div className="pointer-events-none absolute inset-x-0 top-20 z-20 flex justify-center px-4">
      <div className="glass-dark pointer-events-auto flex items-center gap-3 rounded-full border border-gold/30 py-1.5 ps-4 pe-1.5 text-sm text-ivory" role="status">
        <span className="max-w-[55vw] truncate">{t("museum.guide.following", { title: photo?.title || t("museum.prompt.untitled") })}</span>
        <button type="button" onClick={() => setGuide(null)} className="rounded-full bg-white/10 px-3 py-1 text-xs hover:bg-white/20">
          {t("museum.guide.stop")}
        </button>
      </div>
    </div>
  );
}
