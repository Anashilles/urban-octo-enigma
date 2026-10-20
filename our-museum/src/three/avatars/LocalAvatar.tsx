"use client";

import { useCallback, useEffect, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import type * as THREE from "three";
import type { AvatarConfig } from "@/features/avatars/config";
import { usePreferences } from "@/store/preferences";
import { onLocalGesture, player } from "@/three/runtime";
import { AvatarFigure } from "./AvatarFigure";
import type { AvatarMotion, AvatarRig } from "./avatar-rig";
import { FacingTracker } from "./facing";

/**
 * The visitor's own avatar, shown in third-person view. It walks where the
 * player moves, faces the direction of travel, and turns to the camera's
 * heading after looking far enough away while standing still.
 */
export function LocalAvatar({ config }: { config: AvatarConfig }) {
  const thirdPerson = usePreferences((s) => s.cameraMode === "third");
  const group = useRef<THREE.Group>(null);
  const rig = useRef<AvatarRig | null>(null);
  const tracker = useRef(new FacingTracker());
  const motion = useRef<AvatarMotion>({ speed: 0, running: false, turnRate: 0 });

  useEffect(() => onLocalGesture((g) => g === "wave" && rig.current?.wave()), []);
  const onRig = useCallback((r: AvatarRig | null) => {
    rig.current = r;
  }, []);
  const readMotion = useCallback(() => motion.current, []);

  useFrame((_, dt) => {
    const g = group.current;
    if (!g) return;
    const f = tracker.current;
    f.update(player.x, player.z, player.yaw, dt);
    g.position.set(player.x, 0, player.z);
    g.rotation.y = f.facing;
    motion.current = { speed: f.speed, running: player.running || f.speed > 3.3, turnRate: f.turnRate };
  });

  return (
    <group ref={group} visible={thirdPerson} name="local-avatar">
      <AvatarFigure config={config} motion={readMotion} onRig={onRig} />
    </group>
  );
}
