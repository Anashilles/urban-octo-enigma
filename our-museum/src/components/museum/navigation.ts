"use client";

import * as THREE from "three";
import type { SceneData, SceneFrame } from "@/features/museums/scene-types";
import {
  collisionBoxes,
  PLAYER_RADIUS,
  resolveCircleCollisions,
  roomInteriorRect,
} from "@/features/rooms/geometry";
import { useMuseumStore } from "@/store/museum-store";
import { frameWorldMatrix } from "@/three/frames/frames-renderer";
import { player, requestMove } from "@/three/runtime";

export function frameWorldInfo(scene: SceneData, frame: SceneFrame) {
  const room = scene.rooms.find((r) => r.id === frame.roomId);
  if (!room) return null;
  const m = frameWorldMatrix(room, frame, scene.theme.wainscot ? 0.022 : 0);
  const center = new THREE.Vector3().applyMatrix4(m);
  const normal = new THREE.Vector3(0, 0, 1).transformDirection(m);
  return { room, center, normal };
}

/** A comfortable standing point in front of a frame, facing it. */
export function standPoint(scene: SceneData, frame: SceneFrame) {
  const info = frameWorldInfo(scene, frame);
  if (!info) return null;
  const distance = Math.max(1.8, Math.min(3, frame.width * 1.6));
  const r = roomInteriorRect(info.room, -0.6);
  let x = info.center.x + info.normal.x * distance;
  let z = info.center.z + info.normal.z * distance;
  x = Math.min(r.maxX, Math.max(r.minX, x));
  z = Math.min(r.maxZ, Math.max(r.minZ, z));
  [x, z] = resolveCircleCollisions(x, z, PLAYER_RADIUS, collisionBoxes(scene.rooms));
  const yaw = Math.atan2(info.normal.x, info.normal.z);
  const pitch = Math.atan2(info.center.y - 1.62, distance) * 0.8;
  return { x, z, yaw, pitch, roomId: info.room.id };
}

/**
 * Moves the visitor in front of a frame, remembering where they were.
 * `side` shifts the standing point sideways (metres) so several people
 * following the same guide don't stand in one spot.
 */
export function goToFrame(scene: SceneData, frameId: string, opts: { side?: number; remember?: boolean } = {}) {
  const frame = scene.frames.find((f) => f.id === frameId);
  if (!frame) return false;
  const target = standPoint(scene, frame);
  if (!target) return false;
  const store = useMuseumStore.getState();
  if (opts.remember !== false) store.setReturnPose({ x: player.x, z: player.z, yaw: player.yaw, pitch: player.pitch });
  if (opts.side) {
    // Camera right for this yaw is (cos yaw, -sin yaw).
    const [x, z] = resolveCircleCollisions(
      target.x + Math.cos(target.yaw) * opts.side,
      target.z - Math.sin(target.yaw) * opts.side,
      PLAYER_RADIUS,
      collisionBoxes(scene.rooms),
    );
    target.x = x;
    target.z = z;
  }
  const sameRoom = player.roomId === target.roomId;
  if (!sameRoom) store.flashFade();
  requestMove({ ...target, duration: sameRoom ? 1.1 : 0 });
  return true;
}

export function returnToSavedPose() {
  const store = useMuseumStore.getState();
  const pose = store.returnPose;
  if (!pose) return;
  store.flashFade();
  requestMove({ ...pose, duration: 0 });
  store.setReturnPose(null);
}
