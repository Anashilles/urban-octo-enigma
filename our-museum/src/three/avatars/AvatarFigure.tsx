"use client";

import { useEffect, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import type { AvatarConfig } from "@/features/avatars/config";
import { AvatarRig, type AvatarMotion } from "./avatar-rig";

const STILL: AvatarMotion = { speed: 0, running: false, turnRate: 0 };

/**
 * Declarative wrapper around AvatarRig. The rig is rebuilt only when the
 * appearance changes; motion is read every frame from `motion()`.
 */
export function AvatarFigure({
  config,
  motion,
  onRig,
  shadow = true,
}: {
  config: AvatarConfig;
  motion?: () => AvatarMotion;
  onRig?: (rig: AvatarRig | null) => void;
  shadow?: boolean;
}) {
  const key = JSON.stringify(config);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- rebuilt by appearance, not object identity
  const rig = useMemo(() => new AvatarRig(config, { shadow }), [key, shadow]);

  useEffect(() => {
    onRig?.(rig);
    return () => {
      onRig?.(null);
      rig.dispose();
    };
  }, [rig, onRig]);

  useFrame((_, dt) => rig.update(dt, motion ? motion() : STILL));

  return <primitive object={rig.root} />;
}
