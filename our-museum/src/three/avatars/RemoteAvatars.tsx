"use client";

import { memo, useCallback, useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { avatarAnchors, tagElements } from "@/features/realtime/name-tags";
import type { Peer } from "@/features/realtime/protocol";
import { onRemoteGesture, samplePose } from "@/features/realtime/remote-poses";
import { segmentHitDistance } from "@/features/rooms/geometry";
import { useRealtimeStore } from "@/store/realtime-store";
import { useWorld } from "@/three/scenes/MuseumWorld";
import { player } from "@/three/runtime";
import { AvatarFigure } from "./AvatarFigure";
import type { AvatarMotion, AvatarRig } from "./avatar-rig";
import { FacingTracker } from "./facing";

const TAG_RANGE = 16;

/** Everyone else in the museum, drawn from interpolated network poses. */
export function RemoteAvatars() {
  const peers = useRealtimeStore((s) => s.peers);
  const selfId = useRealtimeStore((s) => s.selfId);
  const list = Object.values(peers).filter((p) => p.id !== selfId);
  return (
    <>
      {list.map((p) => (
        <RemoteAvatar key={p.id} peer={p} />
      ))}
      <NameTagProjector />
    </>
  );
}

const RemoteAvatar = memo(function RemoteAvatar({ peer }: { peer: Peer }) {
  const group = useRef<THREE.Group>(null);
  const rig = useRef<AvatarRig | null>(null);
  const tracker = useRef(new FacingTracker());
  const motion = useRef<AvatarMotion>({ speed: 0, running: false, turnRate: 0 });
  const ring = useMemo(() => {
    const geometry = new THREE.RingGeometry(0.34, 0.4, 40).rotateX(-Math.PI / 2);
    const material = new THREE.MeshBasicMaterial({ color: peer.avatar.accent, transparent: true, opacity: 0.55, depthWrite: false, toneMapped: false });
    return { geometry, material };
  }, [peer.avatar.accent]);

  useEffect(
    () => () => {
      ring.geometry.dispose();
      ring.material.dispose();
    },
    [ring],
  );
  useEffect(() => onRemoteGesture((id, g) => id === peer.id && g === "wave" && rig.current?.wave()), [peer.id]);
  useEffect(() => {
    const g = group.current;
    if (!g) return;
    g.userData.tagHeight = 1.98 * peer.avatar.height;
    avatarAnchors.set(peer.id, g);
    return () => {
      if (avatarAnchors.get(peer.id) === g) avatarAnchors.delete(peer.id);
    };
  }, [peer.id, peer.avatar.height]);
  const onRig = useCallback((r: AvatarRig | null) => {
    rig.current = r;
  }, []);
  const readMotion = useCallback(() => motion.current, []);

  useFrame((_, dt) => {
    const g = group.current;
    if (!g) return;
    const p = samplePose(peer.id);
    if (!p) {
      g.visible = false;
      return;
    }
    // Fade out (hide) when someone stands right where the camera is.
    g.visible = Math.hypot(p.x - player.x, p.z - player.z) > 0.55;
    const f = tracker.current;
    f.update(p.x, p.z, p.yaw, dt);
    g.position.set(p.x, 0, p.z);
    g.rotation.y = f.facing;
    motion.current = { speed: Math.max(f.speed, p.speed * 0.9), running: p.running, turnRate: f.turnRate };
  });

  return (
    <group ref={group} visible={false} name={`remote-${peer.id}`}>
      <AvatarFigure config={peer.avatar} motion={readMotion} onRig={onRig} />
      <mesh geometry={ring.geometry} material={ring.material} position={[0, 0.006, 0]} renderOrder={1} />
    </group>
  );
});

/**
 * Moves each DOM name tag (see NameTags) over its avatar's head. Tags are
 * hidden behind walls, behind the camera and beyond TAG_RANGE.
 */
function NameTagProjector() {
  const { boxes } = useWorld();
  const camera = useThree((s) => s.camera);
  const size = useThree((s) => s.size);
  const v = useMemo(() => new THREE.Vector3(), []);
  const occluded = useRef(new Map<string, boolean>());
  const timer = useRef(0);

  useFrame((_, dt) => {
    timer.current += dt;
    const recheck = timer.current > 0.2;
    if (recheck) timer.current = 0;
    for (const [id, el] of tagElements) {
      const anchor = avatarAnchors.get(id);
      if (!anchor || !anchor.visible) {
        el.style.opacity = "0";
        continue;
      }
      const ax = anchor.position.x;
      const az = anchor.position.z;
      const dist = Math.hypot(ax - player.x, az - player.z);
      if (recheck) occluded.current.set(id, dist > 0.5 && segmentHitDistance(player.x, player.z, ax, az, boxes, 0.02) < dist - 0.4);
      v.set(ax, (anchor.userData.tagHeight as number | undefined) ?? 1.95, az).project(camera);
      if (v.z > 1 || dist > TAG_RANGE || occluded.current.get(id)) {
        el.style.opacity = "0";
        continue;
      }
      const x = (v.x * 0.5 + 0.5) * size.width;
      const y = (-v.y * 0.5 + 0.5) * size.height;
      const scale = Math.max(0.75, Math.min(1, 3.5 / Math.max(dist, 0.1)));
      el.style.opacity = "1";
      el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) translate(-50%, -100%) scale(${scale.toFixed(3)})`;
    }
  });
  return null;
}
