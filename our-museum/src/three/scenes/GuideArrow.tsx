"use client";

import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { SceneData } from "@/features/museums/scene-types";
import { roomAt, roomPath } from "@/features/rooms/geometry";
import { standPoint } from "@/components/museum/navigation";
import { useMuseumStore } from "@/store/museum-store";
import { player } from "@/three/runtime";

/**
 * A floating chevron that guides the visitor through doorways to a photo,
 * without teleporting them.
 */
export function GuideArrow({ scene, onArrive }: { scene: SceneData; onArrive: () => void }) {
  const frameId = useMuseumStore((s) => s.guideFrameId);
  const group = useRef<THREE.Group>(null);
  const waypoint = useRef<THREE.Vector2 | null>(null);
  const timer = useRef(1);
  const geometry = useMemo(() => {
    const shape = new THREE.Shape();
    shape.moveTo(0, 0.22);
    shape.lineTo(0.18, -0.02);
    shape.lineTo(0.08, -0.02);
    shape.lineTo(0, 0.09);
    shape.lineTo(-0.08, -0.02);
    shape.lineTo(-0.18, -0.02);
    shape.closePath();
    const g = new THREE.ExtrudeGeometry(shape, { depth: 0.03, bevelEnabled: false });
    g.rotateX(-Math.PI / 2);
    g.translate(0, 0, 0);
    return g;
  }, []);
  const material = useMemo(() => new THREE.MeshBasicMaterial({ color: "#e2c48a", toneMapped: false, transparent: true, opacity: 0.92 }), []);

  useFrame((state, dt) => {
    const g = group.current;
    if (!g) return;
    const frame = frameId ? scene.frames.find((f) => f.id === frameId) : null;
    const target = frame ? standPoint(scene, frame) : null;
    if (!frame || !target) {
      g.visible = false;
      return;
    }
    timer.current += dt;
    if (timer.current > 0.4 || !waypoint.current) {
      timer.current = 0;
      const here = roomAt(scene.rooms, player.x, player.z);
      if (Math.hypot(target.x - player.x, target.z - player.z) < 1.2) {
        useMuseumStore.getState().setGuide(null);
        onArrive();
        g.visible = false;
        return;
      }
      if (!here || here.id === target.roomId) waypoint.current = new THREE.Vector2(target.x, target.z);
      else {
        const path = roomPath(scene.rooms, here.id, target.roomId);
        const via = path?.[0]?.via;
        waypoint.current = via ? new THREE.Vector2(via.x, via.z) : new THREE.Vector2(target.x, target.z);
      }
    }
    const wp = waypoint.current!;
    const dx = wp.x - player.x;
    const dz = wp.y - player.z;
    const angle = Math.atan2(dx, dz);
    const ahead = 1.5;
    const fx = -Math.sin(player.yaw);
    const fz = -Math.cos(player.yaw);
    g.visible = true;
    g.position.set(player.x + fx * ahead, 0.95 + Math.sin(state.clock.elapsedTime * 2.4) * 0.04, player.z + fz * ahead);
    // Chevron points along +Z in its local frame after rotation; aim it at the waypoint.
    g.rotation.set(0, angle, 0);
  });

  return (
    <group ref={group} visible={false}>
      <mesh geometry={geometry} material={material} rotation-y={Math.PI} />
    </group>
  );
}
