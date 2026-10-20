"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import type { AvatarConfig } from "@/features/avatars/config";
import { AvatarFigure } from "@/three/avatars/AvatarFigure";
import { WALK_REF_SPEED } from "@/three/avatars/avatar-animations";
import type { AvatarMotion, AvatarRig } from "@/three/avatars/avatar-rig";

export type StageMode = "idle" | "walk";

function StageSetup() {
  const { gl, scene, camera } = useThree();
  useEffect(() => {
    gl.toneMapping = THREE.ACESFilmicToneMapping;
    gl.toneMappingExposure = 1.05;
    gl.outputColorSpace = THREE.SRGBColorSpace;
    scene.background = new THREE.Color("#ebe5da");
    scene.fog = new THREE.Fog("#ebe5da", 6, 12);
    const pmrem = new THREE.PMREMGenerator(gl);
    const room = new RoomEnvironment();
    const env = pmrem.fromScene(room, 0.04).texture;
    scene.environment = env;
    scene.environmentIntensity = 0.45;
    room.dispose();
    pmrem.dispose();
    camera.lookAt(0, 0.92, 0);
    return () => {
      scene.environment = null;
      scene.fog = null;
      env.dispose();
    };
  }, [gl, scene, camera]);
  return (
    <>
      <hemisphereLight args={["#fff8ec", "#b9ab95", 0.9]} />
      <directionalLight position={[2.2, 3.5, 3]} intensity={1.7} color="#fff3e2" />
      <directionalLight position={[-3, 2.4, -2.5]} intensity={0.9} color="#d9e4ff" />
      <mesh position={[0, -0.03, 0]}>
        <cylinderGeometry args={[0.95, 1.0, 0.06, 64]} />
        <meshStandardMaterial color="#f4efe6" roughness={0.5} />
      </mesh>
      <mesh position={[0, -0.5, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[14, 48]} />
        <meshStandardMaterial color="#e2dbcd" roughness={0.95} />
      </mesh>
    </>
  );
}

function TurntableAvatar({ config, mode, waveKey, yaw }: { config: AvatarConfig; mode: StageMode; waveKey: number; yaw: React.RefObject<{ value: number; velocity: number; dragging: boolean }> }) {
  const group = useRef<THREE.Group>(null);
  const rig = useRef<AvatarRig | null>(null);
  const motion = useRef<AvatarMotion>({ speed: 0, running: false, turnRate: 0 });
  const onRig = useCallback((r: AvatarRig | null) => {
    rig.current = r;
  }, []);
  const readMotion = useCallback(() => motion.current, []);

  useEffect(() => {
    if (waveKey > 0) rig.current?.wave();
  }, [waveKey]);

  useFrame((_, dt) => {
    const y = yaw.current;
    if (!y.dragging) {
      y.value += y.velocity * dt;
      y.velocity *= Math.exp(-3.5 * dt);
    }
    if (group.current) group.current.rotation.y = y.value;
    motion.current = { speed: mode === "walk" ? WALK_REF_SPEED : 0, running: false, turnRate: 0 };
  });

  return (
    <group ref={group}>
      <AvatarFigure config={config} motion={readMotion} onRig={onRig} shadow />
    </group>
  );
}

/**
 * Turntable preview for the avatar editor: drag (or use ← →) to turn the
 * figure, and preview the idle, walk and wave animations.
 */
export default function AvatarStage({ config, mode, waveKey, label }: { config: AvatarConfig; mode: StageMode; waveKey: number; label: string }) {
  const yaw = useRef({ value: -0.35, velocity: 0, dragging: false });
  const drag = useRef<{ id: number; x: number; t: number } | null>(null);
  const camera = useMemo(() => ({ fov: 30, near: 0.1, far: 40, position: [0, 1.2, 4.1] as [number, number, number] }), []);

  return (
    <Canvas
      className="size-full touch-none outline-none focus-visible:ring-2 focus-visible:ring-gold"
      dpr={[1, 2]}
      camera={camera}
      gl={{ antialias: true, alpha: false, stencil: false }}
      tabIndex={0}
      role="img"
      aria-label={label}
      data-testid="avatar-stage"
      onPointerDown={(e) => {
        drag.current = { id: e.pointerId, x: e.clientX, t: performance.now() };
        yaw.current.dragging = true;
        yaw.current.velocity = 0;
        (e.target as Element).setPointerCapture?.(e.pointerId);
      }}
      onPointerMove={(e) => {
        const d = drag.current;
        if (!d || d.id !== e.pointerId) return;
        const now = performance.now();
        const dx = e.clientX - d.x;
        const delta = dx * 0.012;
        yaw.current.value += delta;
        yaw.current.velocity = (delta / Math.max(1, now - d.t)) * 1000 * 0.6;
        d.x = e.clientX;
        d.t = now;
      }}
      onPointerUp={() => {
        drag.current = null;
        yaw.current.dragging = false;
      }}
      onPointerCancel={() => {
        drag.current = null;
        yaw.current.dragging = false;
      }}
      onKeyDown={(e) => {
        if (e.key === "ArrowLeft") yaw.current.value -= 0.25;
        else if (e.key === "ArrowRight") yaw.current.value += 0.25;
        else return;
        e.preventDefault();
      }}
    >
      <StageSetup />
      <TurntableAvatar config={config} mode={mode} waveKey={waveKey} yaw={yaw} />
    </Canvas>
  );
}
