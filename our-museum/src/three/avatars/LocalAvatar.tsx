"use client";

import { useCallback, useEffect, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import type * as THREE from "three";
import type { AvatarConfig } from "@/features/avatars/config";
import { usePreferences } from "@/store/preferences";
import { onLocalGesture, player } from "@/three/runtime";
import { AvatarFigure } from "./AvatarFigure";
import type { AvatarMotion, AvatarRig } from "./avatar-rig";

/** Shortest signed angle from a to b. */
export function angleDelta(a: number, b: number) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

/**
 * The visitor's own avatar, shown in third-person view. It walks where the
 * player moves, faces the direction of travel, and turns to the camera's
 * heading after looking far enough away while standing still.
 */
export function LocalAvatar({ config }: { config: AvatarConfig }) {
  const thirdPerson = usePreferences((s) => s.cameraMode === "third");
  const group = useRef<THREE.Group>(null);
  const rig = useRef<AvatarRig | null>(null);
  const facing = useRef(player.yaw + Math.PI);
  const last = useRef({ x: player.x, z: player.z, init: false });
  const speed = useRef(0);
  const motion = useRef<AvatarMotion>({ speed: 0, running: false, turnRate: 0 });

  useEffect(() => onLocalGesture((g) => g === "wave" && rig.current?.wave()), []);
  const onRig = useCallback((r: AvatarRig | null) => {
    rig.current = r;
  }, []);
  const readMotion = useCallback(() => motion.current, []);

  useFrame((_, rawDt) => {
    const g = group.current;
    if (!g) return;
    const dt = Math.max(1e-3, Math.min(rawDt, 0.1));
    const l = last.current;
    let dx = player.x - l.x;
    let dz = player.z - l.z;
    // Teleports (or the first frame) jump instead of walking.
    if (!l.init || dx * dx + dz * dz > 1.5 * 1.5) {
      dx = 0;
      dz = 0;
      l.init = true;
      facing.current = player.yaw + Math.PI;
    }
    l.x = player.x;
    l.z = player.z;

    // Measured speed also covers glides (Go to photo, tours).
    const measured = Math.hypot(dx, dz) / dt;
    speed.current += (measured - speed.current) * (1 - Math.exp(-12 * dt));

    // Model faces +Z; the camera looks along -Z at yaw 0.
    const cameraHeading = player.yaw + Math.PI;
    let target = facing.current;
    if (speed.current > 0.25 && measured > 0.05) target = Math.atan2(dx, dz);
    else if (Math.abs(angleDelta(facing.current, cameraHeading)) > 1.9) target = cameraHeading;
    const turn = angleDelta(facing.current, target) * (1 - Math.exp(-(speed.current > 0.25 ? 11 : 5) * dt));
    facing.current += turn;

    g.position.set(player.x, 0, player.z);
    g.rotation.y = facing.current;
    motion.current = { speed: speed.current, running: player.running || speed.current > 3.3, turnRate: turn / dt };
  });

  return (
    <group ref={group} visible={thirdPerson} name="local-avatar">
      <AvatarFigure config={config} motion={readMotion} onRig={onRig} />
    </group>
  );
}
