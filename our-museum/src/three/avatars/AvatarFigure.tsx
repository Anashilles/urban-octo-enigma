"use client";

import { useEffect, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import type * as THREE from "three";
import type { AvatarConfig } from "@/features/avatars/config";
import { AvatarRig, type AvatarMotion } from "./avatar-rig";

const STILL: AvatarMotion = { speed: 0, running: false, turnRate: 0 };

/**
 * Declarative wrapper around AvatarRig. The rig is created and disposed in
 * the same effect (safe under StrictMode's double invocation) and rebuilt
 * only when the appearance changes; motion is read every frame.
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
  const container = useRef<THREE.Group>(null);
  const rig = useRef<AvatarRig | null>(null);
  const onRigRef = useRef(onRig);
  const key = JSON.stringify(config);

  useEffect(() => {
    onRigRef.current = onRig;
  }, [onRig]);

  useEffect(() => {
    const r = new AvatarRig(JSON.parse(key) as AvatarConfig, { shadow });
    container.current?.add(r.root);
    rig.current = r;
    onRigRef.current?.(r);
    return () => {
      onRigRef.current?.(null);
      rig.current = null;
      r.dispose();
    };
  }, [key, shadow]);

  useFrame((_, dt) => rig.current?.update(dt, motion ? motion() : STILL));

  return <group ref={container} />;
}
