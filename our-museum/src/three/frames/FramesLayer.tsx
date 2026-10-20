"use client";

import { forwardRef, useEffect, useImperativeHandle, useMemo } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import type { SceneFrame, ScenePhoto, SceneRoom } from "@/features/museums/scene-types";
import type { PhotoTextureManager } from "@/three/loaders/photo-textures";
import { FramesRenderer, type FrameRuntime, type FramesRendererOptions } from "./frames-renderer";

export interface FramesHandle {
  runtimes: () => FrameRuntime[];
  pick: (raycaster: THREE.Raycaster) => string | null;
  setFocus: (id: string | null) => void;
}

interface Props {
  frames: SceneFrame[];
  rooms: SceneRoom[];
  photos: ScenePhoto[];
  manager: PhotoTextureManager;
  options: FramesRendererOptions;
  showOutline: boolean;
}

export const FramesLayer = forwardRef<FramesHandle, Props>(function FramesLayer(
  { frames, rooms, photos, manager, options, showOutline },
  ref,
) {
  const { gl } = useThree();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const renderer = useMemo(() => new FramesRenderer(manager, options), [manager]);
  useEffect(() => () => renderer.dispose(), [renderer]);
  useEffect(() => manager.setMaxAnisotropy(gl.capabilities.getMaxAnisotropy()), [gl, manager]);

  useEffect(() => {
    const changed = renderer.setOptions(options);
    renderer.sync(
      frames,
      new Map(rooms.map((r) => [r.id, r])),
      new Map(photos.map((p) => [p.id, p])),
      changed,
    );
  }, [renderer, frames, rooms, photos, options]);

  useEffect(() => renderer.setOutlineVisible(showOutline), [renderer, showOutline]);

  useImperativeHandle(
    ref,
    () => ({
      runtimes: () => renderer.runtimes,
      pick: (raycaster) => renderer.pick(raycaster),
      setFocus: (id) => {
        renderer.setFocus(id);
        renderer.setOutlineVisible(showOutline);
      },
    }),
    [renderer, showOutline],
  );

  useFrame(({ camera }) => renderer.update(camera, performance.now()));

  return <primitive object={renderer.group} />;
});
