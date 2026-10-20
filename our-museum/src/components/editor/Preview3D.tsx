"use client";

import { useMemo } from "react";
import { wallPointWorld, wallLength, type WallKey } from "@/features/rooms/geometry";
import { useI18n } from "@/i18n/client";
import { useMuseumStore } from "@/store/museum-store";
import { MuseumCanvas } from "@/three/scenes/MuseumCanvas";
import { MuseumWorld } from "@/three/scenes/MuseumWorld";

/** Live 3D preview of the museum, starting in front of the wall being edited. */
export default function Preview3D({ roomId, wallKey }: { roomId: string; wallKey: WallKey }) {
  const { t } = useI18n();
  const scene = useMuseumStore((s) => s.scene);
  const spawned = useMemo(() => {
    if (!scene) return null;
    const room = scene.rooms.find((r) => r.id === roomId);
    if (!room) return scene;
    const p = wallPointWorld(room, wallKey, 0);
    const across = wallKey === "north" || wallKey === "south" ? room.depth : room.width;
    const back = Math.min(Math.max(2.2, wallLength(room, wallKey) * 0.55), across - 0.8);
    return { ...scene, spawn: { x: p.x + p.nx * back, z: p.z + p.nz * back, yaw: Math.atan2(p.nx, p.nz) } };
  }, [scene, roomId, wallKey]);
  if (!spawned) return null;
  return (
    <div className="relative aspect-[16/9] overflow-hidden rounded-2xl border border-border bg-ink" data-testid="editor-preview-3d">
      <MuseumCanvas quality="medium" className="absolute inset-0 size-full touch-none">
        <MuseumWorld scene={spawned} quality="medium" onInteractFrame={() => undefined} />
      </MuseumCanvas>
      <p className="pointer-events-none absolute inset-x-0 bottom-3 text-center text-xs text-ivory/75">{t("museum.clickToLook")}</p>
    </div>
  );
}
