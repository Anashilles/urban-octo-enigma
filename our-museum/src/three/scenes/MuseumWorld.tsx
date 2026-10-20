"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, type ReactNode, type RefObject } from "react";
import { useThree } from "@react-three/fiber";
import * as THREE from "three";
import type { SceneData, SceneFrame, ScenePhoto } from "@/features/museums/scene-types";
import { LIGHTING_SPECS } from "@/features/museums/theme";
import { collisionBoxes, type Rect } from "@/features/rooms/geometry";
import { useI18n } from "@/i18n/client";
import { usePreferences } from "@/store/preferences";
import { useMuseumStore } from "@/store/museum-store";
import { PlayerController, type FocusCandidate } from "@/three/controls/PlayerController";
import { FramesLayer, type FramesHandle } from "@/three/frames/FramesLayer";
import { PhotoTextureManager } from "@/three/loaders/photo-textures";
import { Architecture, WallPickers, type Quality } from "@/three/rooms/Architecture";
import { exposeTestHooks, requestMove } from "@/three/runtime";
import { LightRig, SceneSetup } from "./SceneSetup";

export interface WorldContextValue {
  scene: SceneData;
  boxes: Rect[];
  frames: RefObject<FramesHandle | null>;
  pickers: RefObject<THREE.Group | null>;
  quality: Quality;
}

const WorldContext = createContext<WorldContextValue | null>(null);

export function useWorld() {
  const ctx = useContext(WorldContext);
  if (!ctx) throw new Error("useWorld must be used inside <MuseumWorld>");
  return ctx;
}

interface Props {
  scene: SceneData;
  quality: Quality;
  onInteractFrame: (frameId: string) => void;
  onShortcut?: (code: string) => void;
  allowPointerLock?: boolean;
  keyboard?: boolean;
  /** Additional scene content: avatars, remote visitors, placement preview. */
  children?: ReactNode;
  onPhotoTextureError?: (photo: ScenePhoto) => void;
}

export function MuseumWorld({
  scene,
  quality,
  onInteractFrame,
  onShortcut,
  allowPointerLock = true,
  keyboard = true,
  children,
  onPhotoTextureError,
}: Props) {
  const { camera } = useThree();
  const { t, formatDate, dir } = useI18n();
  const outlines = usePreferences((s) => s.interactionOutlines);
  const setFocused = useMuseumStore((s) => s.setFocused);
  const setCurrentRoom = useMuseumStore((s) => s.setCurrentRoom);
  const framesRef = useRef<FramesHandle | null>(null);
  const pickersRef = useRef<THREE.Group | null>(null);
  const manager = useMemo(() => new PhotoTextureManager(), []);
  useEffect(() => () => manager.dispose(), [manager]);
  useEffect(() => {
    manager.onError = (photo) => onPhotoTextureError?.(photo);
  }, [manager, onPhotoTextureError]);

  const boxes = useMemo(() => collisionBoxes(scene.rooms), [scene.rooms]);
  const lighting = LIGHTING_SPECS[scene.theme.lightingPreset];
  const lightCount = quality === "high" ? 4 : quality === "medium" ? 3 : 2;

  const frameOptions = useMemo(
    () => ({
      wallOffset: scene.theme.wainscot ? 0.022 : 0,
      lightColor: lighting.lightColor,
      washOpacity: lighting.wash,
      photoBrightness: lighting.photoBrightness,
      rtl: dir === "rtl",
      plaqueSubtitle: (_frame: SceneFrame, photo: ScenePhoto | undefined) =>
        photo?.takenAt ? formatDate(photo.takenAt, { year: "numeric", month: "long" }) : photo?.sample ? t("demo.sampleLabel") : "",
    }),
    [scene.theme.wainscot, lighting, dir, formatDate, t],
  );

  const getFocusCandidates = useCallback((): FocusCandidate[] => framesRef.current?.runtimes() ?? [], []);
  const raycaster = useMemo(() => new THREE.Raycaster(), []);
  const pickAtPointer = useCallback(
    (ndc: THREE.Vector2) => {
      raycaster.setFromCamera(ndc, camera);
      raycaster.far = 12;
      return framesRef.current?.pick(raycaster) ?? null;
    },
    [camera, raycaster],
  );
  const onFocus = useCallback(
    (id: string | null) => {
      framesRef.current?.setFocus(id);
      setFocused(id);
    },
    [setFocused],
  );

  useEffect(() => {
    exposeTestHooks({
      frames: () => framesRef.current?.runtimes().map((r) => ({ id: r.id, photoId: r.photoId, x: r.center.x, y: r.center.y, z: r.center.z })) ?? [],
      focused: () => useMuseumStore.getState().focusedFrameId,
      currentRoom: () => useMuseumStore.getState().currentRoomId,
      teleport: (x: number, z: number, yaw = 0) => requestMove({ x, z, yaw, duration: 0 }),
    });
  }, []);

  const ctx = useMemo<WorldContextValue>(
    () => ({ scene, boxes, frames: framesRef, pickers: pickersRef, quality }),
    [scene, boxes, quality],
  );

  return (
    <WorldContext.Provider value={ctx}>
      <SceneSetup lighting={lighting} />
      <LightRig rooms={scene.rooms} theme={scene.theme} count={lightCount} />
      <Architecture rooms={scene.rooms} theme={scene.theme} quality={quality} />
      <WallPickers ref={pickersRef} rooms={scene.rooms} />
      <FramesLayer
        ref={framesRef}
        frames={scene.frames}
        rooms={scene.rooms}
        photos={scene.photos}
        manager={manager}
        options={frameOptions}
        showOutline={outlines}
      />
      <PlayerController
        rooms={scene.rooms}
        boxes={boxes}
        spawn={scene.spawn}
        onFocus={onFocus}
        onInteract={onInteractFrame}
        onRoomChange={setCurrentRoom}
        getFocusCandidates={getFocusCandidates}
        pickAtPointer={pickAtPointer}
        onShortcut={onShortcut}
        allowPointerLock={allowPointerLock}
        keyboard={keyboard}
      />
      {children}
    </WorldContext.Provider>
  );
}
