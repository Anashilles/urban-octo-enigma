"use client";

import { useEffect, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import {
  EYE_HEIGHT,
  PLAYER_RADIUS,
  resolveCircleCollisions,
  roomAt,
  segmentHitDistance,
  type Rect,
  type RoomShape,
} from "@/features/rooms/geometry";
import { usePreferences } from "@/store/preferences";
import { pending, player } from "@/three/runtime";
import { input, isTypingTarget, MOVEMENT_CODES, resetMovementInput } from "./input";

const WALK_SPEED = 2.1;
const RUN_SPEED = 4.3;
const LOOK_SCALE = 0.0022;
const MAX_PITCH = (85 * Math.PI) / 180;

export interface FocusCandidate {
  id: string;
  center: THREE.Vector3;
  normal: THREE.Vector3;
}

interface Props {
  rooms: RoomShape[];
  boxes: Rect[];
  spawn: { x: number; z: number; yaw: number };
  /** Called with the focused frame id when it changes. */
  onFocus: (id: string | null) => void;
  onInteract: (frameId: string) => void;
  onRoomChange: (roomId: string | null) => void;
  getFocusCandidates: () => FocusCandidate[];
  pickAtPointer: (ndc: THREE.Vector2) => string | null;
  /** Keyboard shortcuts handled by the HUD (help, camera mode, fullscreen…). */
  onShortcut?: (code: string) => void;
  /** Disables pointer lock (e.g. the landing-page preview). */
  allowPointerLock?: boolean;
  /** Listen to the keyboard (off for embedded previews so page scrolling keeps working). */
  keyboard?: boolean;
  thirdPersonDistance?: number;
}

function easeInOut(t: number) {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}

function angleDelta(a: number, b: number) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

export function PlayerController({
  rooms,
  boxes,
  spawn,
  onFocus,
  onInteract,
  onRoomChange,
  getFocusCandidates,
  pickAtPointer,
  onShortcut,
  allowPointerLock = true,
  keyboard = true,
  thirdPersonDistance = 3.1,
}: Props) {
  const { camera, gl } = useThree();
  const velocity = useRef(new THREE.Vector2());
  const bobPhase = useRef(0);
  const glide = useRef<{ from: typeof player; to: { x: number; z: number; yaw: number; pitch: number }; t: number; duration: number } | null>(null);
  const focusRef = useRef<string | null>(null);
  const roomRef = useRef<string | null>(null);
  const roomCheck = useRef(0);
  const camDistance = useRef(thirdPersonDistance);

  // Initial pose.
  useEffect(() => {
    player.x = spawn.x;
    player.z = spawn.z;
    player.yaw = spawn.yaw;
    player.pitch = 0;
    velocity.current.set(0, 0);
  }, [spawn.x, spawn.z, spawn.yaw]);

  // Keyboard, pointer lock and drag-to-look.
  useEffect(() => {
    const el = gl.domElement;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const target = e.target as HTMLElement | null;
      if (isTypingTarget(target) || target?.closest?.("[data-hud-panel]")) return;
      if (!input.enabled) return;
      if (MOVEMENT_CODES.has(e.code)) {
        input.keys.add(e.code);
        if (e.code.startsWith("Arrow")) e.preventDefault();
        return;
      }
      if (e.code === "KeyE" || (e.code === "Enter" && target === el)) {
        input.interactRequested = true;
        return;
      }
      onShortcut?.(e.code);
    };
    const onKeyUp = (e: KeyboardEvent) => {
      input.keys.delete(e.code);
    };
    const onBlur = () => resetMovementInput();
    const onVisibility = () => {
      if (document.hidden) resetMovementInput();
    };

    const onLockChange = () => {
      input.pointerLocked = document.pointerLockElement === el;
    };
    const onMouseMove = (e: MouseEvent) => {
      if (input.pointerLocked && input.enabled) {
        input.lookX += e.movementX;
        input.lookY += e.movementY;
      }
    };

    let drag: { id: number; x: number; y: number; moved: number; type: string } | null = null;
    const onPointerDown = (e: PointerEvent) => {
      if (!input.enabled) return;
      if (input.pointerLocked) {
        // Clicking while locked interacts with whatever is under the crosshair.
        input.interactRequested = true;
        return;
      }
      drag = { id: e.pointerId, x: e.clientX, y: e.clientY, moved: 0, type: e.pointerType };
      el.setPointerCapture?.(e.pointerId);
    };
    const onPointerMove = (e: PointerEvent) => {
      if (!drag || drag.id !== e.pointerId || input.pointerLocked) return;
      const dx = e.clientX - drag.x;
      const dy = e.clientY - drag.y;
      drag.x = e.clientX;
      drag.y = e.clientY;
      drag.moved += Math.abs(dx) + Math.abs(dy);
      if (!input.enabled) return;
      // "Grab" semantics: drag right to turn left, like moving the world.
      const k = drag.type === "touch" ? 1.15 : 0.85;
      input.lookX -= dx * k;
      input.lookY -= dy * k;
    };
    const onPointerUp = (e: PointerEvent) => {
      if (!drag || drag.id !== e.pointerId) return;
      const wasTap = drag.moved < 8;
      const type = drag.type;
      drag = null;
      if (!wasTap || !input.enabled) return;
      const rect = el.getBoundingClientRect();
      const ndc = new THREE.Vector2(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
      const hit = pickAtPointer(ndc);
      if (hit) {
        onInteract(hit);
        return;
      }
      if (type === "mouse" && allowPointerLock && !input.pointerLocked) {
        // Pointer lock can be refused (iframes, browser policy) — drag-to-look keeps working.
        try {
          const result = el.requestPointerLock?.() as unknown as Promise<void> | undefined;
          result?.catch?.(() => undefined);
        } catch {
          /* ignore */
        }
      }
    };

    if (keyboard) {
      window.addEventListener("keydown", onKeyDown);
      window.addEventListener("keyup", onKeyUp);
    }
    window.addEventListener("blur", onBlur);
    document.addEventListener("visibilitychange", onVisibility);
    document.addEventListener("pointerlockchange", onLockChange);
    document.addEventListener("mousemove", onMouseMove);
    el.addEventListener("pointerdown", onPointerDown);
    el.addEventListener("pointermove", onPointerMove);
    el.addEventListener("pointerup", onPointerUp);
    el.addEventListener("pointercancel", onPointerUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onBlur);
      document.removeEventListener("visibilitychange", onVisibility);
      document.removeEventListener("pointerlockchange", onLockChange);
      document.removeEventListener("mousemove", onMouseMove);
      el.removeEventListener("pointerdown", onPointerDown);
      el.removeEventListener("pointermove", onPointerMove);
      el.removeEventListener("pointerup", onPointerUp);
      el.removeEventListener("pointercancel", onPointerUp);
      if (document.pointerLockElement === el) document.exitPointerLock();
      resetMovementInput();
    };
  }, [gl, onInteract, onShortcut, pickAtPointer, allowPointerLock, keyboard]);

  const forward = useRef(new THREE.Vector3());
  const toFrame = useRef(new THREE.Vector3());
  const camPos = useRef(new THREE.Vector3());

  useFrame((state, rawDelta) => {
    // Clamp huge gaps (tab switches) but allow slow frame rates to move at real speed.
    const dt = Math.min(rawDelta, 0.25);
    const prefs = usePreferences.getState();

    // UI-requested moves (Go to photo, tours, return to previous position).
    if (pending.move) {
      const m = pending.move;
      pending.move = null;
      const target = { x: m.x, z: m.z, yaw: m.yaw, pitch: m.pitch ?? 0 };
      const blocked = segmentHitDistance(player.x, player.z, m.x, m.z, boxes, 0) < Math.hypot(m.x - player.x, m.z - player.z) - 0.05;
      if (m.duration <= 0 || blocked || prefs.reducedMotion) {
        Object.assign(player, target);
        glide.current = null;
      } else {
        glide.current = { from: { ...player }, to: target, t: 0, duration: m.duration };
      }
      velocity.current.set(0, 0);
    }

    if (glide.current) {
      const g = glide.current;
      g.t += dt / g.duration;
      const k = easeInOut(Math.min(1, g.t));
      player.x = g.from.x + (g.to.x - g.from.x) * k;
      player.z = g.from.z + (g.to.z - g.from.z) * k;
      player.yaw = g.from.yaw + angleDelta(g.from.yaw, g.to.yaw) * k;
      player.pitch = g.from.pitch + (g.to.pitch - g.from.pitch) * k;
      player.speed = 1.5;
      player.moving = g.t < 1;
      if (g.t >= 1) glide.current = null;
      input.lookX = input.lookY = 0;
    } else {
      // Look.
      const sens = LOOK_SCALE * prefs.mouseSensitivity;
      player.yaw -= input.lookX * sens;
      player.pitch -= input.lookY * sens * (prefs.invertY ? -1 : 1);
      player.pitch = Math.max(-MAX_PITCH, Math.min(MAX_PITCH, player.pitch));
      input.lookX = 0;
      input.lookY = 0;

      // Move.
      const k = input.keys;
      let fwd = 0;
      let strafe = 0;
      if (input.enabled) {
        fwd = (k.has("KeyW") || k.has("ArrowUp") ? 1 : 0) - (k.has("KeyS") || k.has("ArrowDown") ? 1 : 0) + input.joyY;
        strafe = (k.has("KeyD") || k.has("ArrowRight") ? 1 : 0) - (k.has("KeyA") || k.has("ArrowLeft") ? 1 : 0) + input.joyX;
      }
      const mag = Math.hypot(fwd, strafe);
      if (mag > 1) {
        fwd /= mag;
        strafe /= mag;
      }
      const running = input.enabled && (k.has("ShiftLeft") || k.has("ShiftRight") || input.sprintToggle);
      const speed = (running ? RUN_SPEED : WALK_SPEED) * prefs.moveSpeed;
      const sin = Math.sin(player.yaw);
      const cos = Math.cos(player.yaw);
      // yaw = 0 faces −Z.
      const desiredX = (-sin * fwd + cos * strafe) * speed;
      const desiredZ = (-cos * fwd - sin * strafe) * speed;
      // Fixed sub-steps keep speed frame-rate independent and stop tunnelling on slow devices.
      const steps = Math.max(1, Math.ceil(dt / (1 / 30)));
      const h = dt / steps;
      for (let i = 0; i < steps; i++) {
        const response = 1 - Math.exp(-(mag > 0.01 ? 9 : 11) * h);
        velocity.current.x += (desiredX - velocity.current.x) * response;
        velocity.current.y += (desiredZ - velocity.current.y) * response;
        const nx = player.x + velocity.current.x * h;
        const nz = player.z + velocity.current.y * h;
        const [cx, cz] = resolveCircleCollisions(nx, nz, PLAYER_RADIUS, boxes);
        // Slide along walls: keep only the velocity that was not blocked.
        if (h > 0) {
          velocity.current.x = (cx - player.x) / h;
          velocity.current.y = (cz - player.z) / h;
        }
        player.x = cx;
        player.z = cz;
      }
      player.speed = velocity.current.length();
      player.moving = player.speed > 0.15;
      player.running = running && player.moving;
    }

    // Camera.
    const thirdPerson = prefs.cameraMode === "third";
    let bob = 0;
    if (player.moving && !prefs.reducedMotion && !thirdPerson && !glide.current) {
      bobPhase.current += dt * (player.running ? 11 : 7.5);
      bob = Math.sin(bobPhase.current) * 0.022 * Math.min(1, player.speed / WALK_SPEED);
    }
    if (!thirdPerson) {
      camera.position.set(player.x, EYE_HEIGHT + bob, player.z);
      camera.rotation.set(player.pitch, player.yaw, 0, "YXZ");
    } else {
      // Follow camera behind the avatar, pulled in when a wall is in the way.
      const room = roomAt(rooms, player.x, player.z);
      const ceiling = (room?.height ?? 4) - 0.25;
      const pitch = Math.max(-0.6, Math.min(0.5, player.pitch));
      const want = thirdPersonDistance;
      const backX = player.x + Math.sin(player.yaw) * want * Math.cos(pitch);
      const backZ = player.z + Math.cos(player.yaw) * want * Math.cos(pitch);
      const hit = segmentHitDistance(player.x, player.z, backX, backZ, boxes, 0.18);
      const target = Math.max(0.35, Math.min(want, hit));
      camDistance.current += (target - camDistance.current) * (target < camDistance.current ? 0.6 : 1 - Math.exp(-4 * dt));
      const d = camDistance.current;
      camPos.current.set(
        player.x + Math.sin(player.yaw) * d * Math.cos(pitch),
        Math.min(ceiling, EYE_HEIGHT + 0.35 - Math.sin(pitch) * d),
        player.z + Math.cos(player.yaw) * d * Math.cos(pitch),
      );
      camera.position.copy(camPos.current);
      camera.lookAt(player.x, EYE_HEIGHT - 0.05, player.z);
    }

    // Current room (throttled).
    roomCheck.current += dt;
    if (roomCheck.current > 0.25) {
      roomCheck.current = 0;
      const id = roomAt(rooms, player.x, player.z)?.id ?? null;
      player.roomId = id;
      if (id !== roomRef.current) {
        roomRef.current = id;
        onRoomChange(id);
      }
    }

    // Focus: the frame in front of the viewer, close enough and facing them.
    camera.getWorldDirection(forward.current);
    const eye = new THREE.Vector3(player.x, EYE_HEIGHT, player.z);
    if (thirdPerson) forward.current.set(-Math.sin(player.yaw), 0, -Math.cos(player.yaw));
    let best: string | null = null;
    let bestScore = -Infinity;
    for (const c of getFocusCandidates()) {
      toFrame.current.subVectors(c.center, eye);
      const dist = toFrame.current.length();
      if (dist > 4.6) continue;
      // Must be in front of the frame.
      if (-toFrame.current.dot(c.normal) < 0.15) continue;
      toFrame.current.divideScalar(dist);
      const flat = thirdPerson ? new THREE.Vector3(toFrame.current.x, 0, toFrame.current.z).normalize() : toFrame.current;
      const facing = forward.current.dot(flat);
      if (facing < (thirdPerson ? 0.75 : 0.9)) continue;
      const score = facing * 2 - dist * 0.25;
      if (score > bestScore) {
        bestScore = score;
        best = c.id;
      }
    }
    if (best !== focusRef.current) {
      focusRef.current = best;
      onFocus(best);
    }
    if (input.interactRequested) {
      input.interactRequested = false;
      if (focusRef.current && input.enabled) onInteract(focusRef.current);
      else if (input.pointerLocked) {
        const hit = pickAtPointer(new THREE.Vector2(0, 0));
        if (hit) onInteract(hit);
      }
    }
    state.invalidate();
  });

  return null;
}
