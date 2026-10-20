"use client";

import { useMemo } from "react";
import * as THREE from "three";
import type { RoomDecor } from "@/features/rooms/geometry";
import { plainMaterial } from "@/three/materials/materials";
import { blobShadowTexture } from "@/three/materials/textures";

/** Shared geometries for decor items (created once). */
const geo = {
  benchSeat: new THREE.BoxGeometry(1.8, 0.07, 0.5),
  benchCushion: new THREE.BoxGeometry(1.7, 0.05, 0.42),
  benchLeg: new THREE.BoxGeometry(0.06, 0.4, 0.42),
  pedestal: new THREE.BoxGeometry(0.55, 1.05, 0.55),
  pedestalCap: new THREE.BoxGeometry(0.62, 0.04, 0.62),
  sculpture: new THREE.TorusKnotGeometry(0.17, 0.055, 128, 16, 2, 3),
  plinth: new THREE.CylinderGeometry(0.38, 0.42, 0.5, 40),
  orb: new THREE.SphereGeometry(0.26, 48, 32),
  ring: new THREE.TorusGeometry(0.34, 0.035, 16, 72),
  pot: new THREE.CylinderGeometry(0.24, 0.18, 0.46, 32),
  leaf: new THREE.IcosahedronGeometry(0.22, 1),
  shadow: new THREE.PlaneGeometry(1, 1),
};

function Shadow({ w, d }: { w: number; d: number }) {
  const mat = useMemo(
    () => new THREE.MeshBasicMaterial({ map: blobShadowTexture(), transparent: true, depthWrite: false, opacity: 0.8 }),
    [],
  );
  return <mesh geometry={geo.shadow} material={mat} rotation-x={-Math.PI / 2} position-y={0.004} scale={[w, d, 1]} />;
}

export function DecorItem({ item, accent }: { item: RoomDecor; accent: string }) {
  const rot = (item.rotation * Math.PI) / 180;
  const walnut = plainMaterial("#4a3628", 0.55);
  const metal = plainMaterial("#2a2927", 0.35, 0.8);
  switch (item.type) {
    case "bench":
      return (
        <group position={[item.x, 0, item.z]} rotation-y={rot}>
          <Shadow w={2.3} d={0.9} />
          <mesh geometry={geo.benchSeat} material={walnut} position-y={0.43} />
          <mesh geometry={geo.benchCushion} material={plainMaterial("#d8cdb9", 0.95)} position-y={0.49} />
          <mesh geometry={geo.benchLeg} material={metal} position={[-0.75, 0.2, 0]} />
          <mesh geometry={geo.benchLeg} material={metal} position={[0.75, 0.2, 0]} />
        </group>
      );
    case "pedestal":
      return (
        <group position={[item.x, 0, item.z]} rotation-y={rot}>
          <Shadow w={1} d={1} />
          <mesh geometry={geo.pedestal} material={plainMaterial("#f1eee8", 0.8)} position-y={0.525} />
          <mesh geometry={geo.pedestalCap} material={plainMaterial("#e7e2d8", 0.6)} position-y={1.07} />
          <mesh geometry={geo.orb} material={plainMaterial(accent, 0.25, 0.9)} position-y={1.35} />
        </group>
      );
    case "sculpture":
      return (
        <group position={[item.x, 0, item.z]} rotation-y={rot}>
          <Shadow w={1.3} d={1.3} />
          <mesh geometry={geo.plinth} material={plainMaterial("#2d2b29", 0.4, 0.1)} position-y={0.25} />
          <mesh geometry={geo.sculpture} material={plainMaterial(accent, 0.22, 0.95)} position-y={0.95} />
          <mesh geometry={geo.ring} material={plainMaterial("#e9e3d6", 0.3, 0.6)} position-y={0.95} rotation-x={Math.PI / 2.3} />
        </group>
      );
    case "plant":
      return (
        <group position={[item.x, 0, item.z]} rotation-y={rot}>
          <Shadow w={0.9} d={0.9} />
          <mesh geometry={geo.pot} material={plainMaterial("#d9cfbf", 0.8)} position-y={0.23} />
          {[
            [0, 0.72, 0, 1.2],
            [0.14, 0.92, 0.06, 0.9],
            [-0.12, 1.05, -0.05, 0.8],
            [0.02, 1.24, 0.08, 0.65],
          ].map(([x, y, z, s], i) => (
            <mesh key={i} geometry={geo.leaf} material={plainMaterial(i % 2 ? "#5f7a5f" : "#6f8b6b", 0.85)} position={[x!, y!, z!]} scale={s} />
          ))}
        </group>
      );
  }
}
