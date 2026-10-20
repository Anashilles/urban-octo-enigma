"use client";

import { useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { LIGHTING_SPECS, type LightingSpec, type ResolvedTheme } from "@/features/museums/theme";
import type { RoomShape } from "@/features/rooms/geometry";
import { roomLightPointsLocal } from "@/three/rooms/room-geometry";
import { player } from "@/three/runtime";

/** Renderer, background and a procedural environment map for subtle reflections. */
export function SceneSetup({ lighting }: { lighting: LightingSpec }) {
  const { gl, scene } = useThree();
  useEffect(() => {
    gl.toneMapping = THREE.ACESFilmicToneMapping;
    gl.toneMappingExposure = lighting.exposure;
    scene.background = new THREE.Color(lighting.background);
  }, [gl, scene, lighting]);
  useEffect(() => {
    const pmrem = new THREE.PMREMGenerator(gl);
    const room = new RoomEnvironment();
    const env = pmrem.fromScene(room, 0.04).texture;
    scene.environment = env;
    scene.environmentIntensity = 0.35;
    room.dispose();
    pmrem.dispose();
    return () => {
      scene.environment = null;
      env.dispose();
    };
  }, [gl, scene]);
  return (
    <>
      <ambientLight intensity={lighting.ambient} color={lighting.lightColor} />
      <hemisphereLight args={[lighting.hemisphereSky, lighting.hemisphereGround, lighting.hemisphere]} />
    </>
  );
}

interface LightPoint {
  position: THREE.Vector3;
  color: THREE.Color;
  intensity: number;
}

/**
 * A fixed pool of point lights reassigned to the ceiling light positions
 * nearest the visitor. Keeping the light count constant avoids shader
 * recompilation while still lighting the rooms you can see.
 */
export function LightRig({ rooms, theme, count }: { rooms: RoomShape[]; theme: ResolvedTheme; count: number }) {
  const lights = useRef<Array<THREE.PointLight | null>>([]);
  const points = useMemo<LightPoint[]>(() => {
    const list: LightPoint[] = [];
    for (const room of rooms) {
      const spec = LIGHTING_SPECS[room.layout.lighting.preset ?? theme.lightingPreset];
      const k = room.layout.lighting.intensity ?? 1;
      const rot = (room.rotation * Math.PI) / 180;
      for (const p of roomLightPointsLocal(room)) {
        const world = p.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), rot).add(new THREE.Vector3(room.positionX, 0, room.positionZ));
        const area = room.width * room.depth;
        list.push({ position: world, color: new THREE.Color(spec.lightColor), intensity: spec.roomLight * k * (2 + area / 40) });
      }
    }
    return list;
  }, [rooms, theme]);
  const timer = useRef(10);

  useFrame((_, dt) => {
    timer.current += dt;
    if (timer.current < 0.3) return;
    timer.current = 0;
    const sorted = [...points].sort(
      (a, b) => Math.hypot(a.position.x - player.x, a.position.z - player.z) - Math.hypot(b.position.x - player.x, b.position.z - player.z),
    );
    lights.current.forEach((light, i) => {
      if (!light) return;
      const p = sorted[i];
      if (!p) {
        light.intensity = 0;
        return;
      }
      light.position.copy(p.position);
      light.color.copy(p.color);
      light.intensity = p.intensity;
    });
  });

  return (
    <>
      {Array.from({ length: count }, (_, i) => (
        <pointLight
          key={i}
          ref={(l) => {
            lights.current[i] = l;
          }}
          intensity={0}
          decay={2}
          distance={0}
        />
      ))}
    </>
  );
}
