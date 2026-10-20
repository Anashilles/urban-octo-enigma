"use client";

import { forwardRef, memo, useEffect, useMemo } from "react";
import * as THREE from "three";
import type { ResolvedTheme } from "@/features/museums/theme";
import { WALL_KEYS, wallLength, wallTransform, type RoomShape } from "@/features/rooms/geometry";
import {
  ceilingMaterial,
  emissiveMaterial,
  floorMaterial,
  floorTextureSize,
  pickerMaterial,
  plainMaterial,
  wallMaterial,
} from "@/three/materials/materials";
import { floorSpec } from "@/three/materials/textures";
import { DecorItem } from "./Decor";
import { buildRoomGeometry, roomSignature } from "./room-geometry";

export type Quality = "low" | "medium" | "high";

export function roomWallColor(room: RoomShape, theme: ResolvedTheme) {
  if (room.layout.wallColor) return room.layout.wallColor;
  if (room.roomType === "special" || room.roomType === "reflection") return theme.accentWallColor;
  return theme.wallColor;
}

const RoomMesh = memo(function RoomMesh({ room, theme, quality }: { room: RoomShape; theme: ResolvedTheme; quality: Quality }) {
  const floorKind = room.layout.floorMaterial ?? theme.floorMaterial;
  const texSize = floorTextureSize(quality);
  const tile = floorSpec(floorKind, texSize).tileSize;
  const sig = roomSignature(room);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const build = useMemo(() => buildRoomGeometry(room, theme, tile), [sig, theme, tile]);
  useEffect(() => () => build.dispose(), [build]);

  const dark = (room.layout.lighting.preset ?? theme.lightingPreset) === "dramatic";
  const trimColor = theme.trimColor;
  const trimIsMetal = theme.trimMetallic;

  return (
    <group position={[room.positionX, 0, room.positionZ]} rotation-y={(room.rotation * Math.PI) / 180}>
      <mesh geometry={build.floor} material={floorMaterial(floorKind, texSize)} receiveShadow />
      <mesh geometry={build.ceiling} material={ceilingMaterial(theme.ceilingColor)} />
      <mesh geometry={build.walls} material={wallMaterial(roomWallColor(room, theme), theme.plasterTexture)} />
      {build.trim && <mesh geometry={build.trim} material={plainMaterial(trimColor, trimIsMetal ? 0.35 : 0.6, trimIsMetal ? 0.85 : 0)} />}
      {build.wainscot && <mesh geometry={build.wainscot} material={plainMaterial("#5a4231", 0.55)} />}
      {build.dark && <mesh geometry={build.dark} material={plainMaterial("#1c1c1d", 0.5, 0.4)} />}
      {build.emissive && <mesh geometry={build.emissive} material={emissiveMaterial(dark ? "#ffd9a6" : "#fffaf0", dark ? 1.1 : 1.0)} />}
      {build.threshold && <mesh geometry={build.threshold} material={plainMaterial(dark ? "#8c7344" : "#d8d0c2", 0.4, dark ? 0.7 : 0)} />}
      {room.layout.decor.map((d) => (
        <DecorItem key={d.id} item={d} accent={dark ? "#c6a66a" : "#b8975c"} />
      ))}
    </group>
  );
});

/**
 * Invisible surfaces over each wall's inner face, used for raycasting in
 * "place on wall" mode. userData identifies the room and wall.
 */
export const WallPickers = forwardRef<THREE.Group, { rooms: RoomShape[] }>(function WallPickers({ rooms }, ref) {
  const meshes = useMemo(() => {
    const list: THREE.Mesh[] = [];
    for (const room of rooms) {
      for (const key of WALL_KEYS) {
        const len = wallLength(room, key);
        const t = wallTransform(room, key);
        const geom = new THREE.PlaneGeometry(len, room.height);
        const mesh = new THREE.Mesh(geom, pickerMaterial);
        const wallGroup = new THREE.Object3D();
        wallGroup.position.set(...t.position);
        wallGroup.rotation.y = t.rotationY;
        mesh.position.set(0, room.height / 2, 0.002);
        wallGroup.add(mesh);
        const roomGroup = new THREE.Object3D();
        roomGroup.position.set(room.positionX, 0, room.positionZ);
        roomGroup.rotation.y = (room.rotation * Math.PI) / 180;
        roomGroup.add(wallGroup);
        roomGroup.updateMatrixWorld(true);
        mesh.matrix.copy(mesh.matrixWorld);
        mesh.matrixAutoUpdate = false;
        mesh.removeFromParent();
        mesh.userData = { roomId: room.id, wallKey: key };
        list.push(mesh);
      }
    }
    return list;
  }, [rooms]);
  useEffect(() => () => meshes.forEach((m) => m.geometry.dispose()), [meshes]);
  return (
    <group ref={ref}>
      {meshes.map((m) => (
        <primitive key={m.uuid} object={m} />
      ))}
    </group>
  );
});

export function Architecture({ rooms, theme, quality }: { rooms: RoomShape[]; theme: ResolvedTheme; quality: Quality }) {
  return (
    <group>
      {rooms.map((room) => (
        <RoomMesh key={room.id} room={room} theme={theme} quality={quality} />
      ))}
    </group>
  );
}
