import * as THREE from "three";
import type { AvatarConfig } from "@/features/avatars/config";
import { blobShadowTexture } from "@/three/materials/textures";
import { RUN_CYCLE, RUN_REF_SPEED, WALK_CYCLE, WALK_REF_SPEED, avatarClips, type ClipName } from "./avatar-animations";
import { buildAvatar, type AvatarBuild } from "./avatar-builder";

export interface AvatarMotion {
  /** Horizontal ground speed in m/s. */
  speed: number;
  running: boolean;
  /** Facing change in rad/s (drives the turn-in-place step). */
  turnRate: number;
}

type LoopClip = Exclude<ClipName, "wave">;
const LOOPS: LoopClip[] = ["idle", "walk", "run", "turn"];

function smoothstep(a: number, b: number, x: number) {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

let shadowGeometry: THREE.PlaneGeometry | null = null;

/**
 * A complete animated avatar: built figure, contact shadow and an
 * AnimationMixer that blends idle / walk / run / turn by speed and plays
 * one-shot gestures (wave) on top.
 */
export class AvatarRig {
  readonly root = new THREE.Group();
  readonly figure: THREE.Group;
  private readonly build: AvatarBuild;
  private readonly mixer: THREE.AnimationMixer;
  private readonly actions: Record<ClipName, THREE.AnimationAction>;
  private readonly weights: Record<LoopClip, number> = { idle: 1, walk: 0, run: 0, turn: 0 };
  private readonly shadowMaterial: THREE.MeshBasicMaterial;
  private waveFading: boolean | null = null;

  constructor(config: AvatarConfig, opts: { shadow?: boolean } = {}) {
    this.build = buildAvatar(config);
    this.figure = this.build.root;
    this.root.name = "avatar-rig";
    this.root.add(this.figure);

    this.shadowMaterial = new THREE.MeshBasicMaterial({ map: blobShadowTexture(), transparent: true, depthWrite: false, toneMapped: false, opacity: 0.85 });
    if (opts.shadow !== false) {
      shadowGeometry ??= new THREE.PlaneGeometry(0.85, 0.85).rotateX(-Math.PI / 2);
      const shadow = new THREE.Mesh(shadowGeometry, this.shadowMaterial);
      shadow.position.y = 0.004;
      shadow.renderOrder = 1;
      this.root.add(shadow);
    }

    this.mixer = new THREE.AnimationMixer(this.figure);
    const clips = avatarClips();
    this.actions = {} as Record<ClipName, THREE.AnimationAction>;
    for (const name of LOOPS) {
      const action = this.mixer.clipAction(clips[name]);
      action.setLoop(THREE.LoopRepeat, Infinity);
      action.setEffectiveWeight(name === "idle" ? 1 : 0);
      action.play();
      this.actions[name] = action;
    }
    // Different visitors shouldn't breathe in sync.
    this.actions.idle.time = Math.random() * clips.idle.duration;
    const wave = this.mixer.clipAction(clips.wave);
    wave.setLoop(THREE.LoopOnce, 1);
    wave.clampWhenFinished = false;
    this.actions.wave = wave;
  }

  update(dt: number, motion: AvatarMotion) {
    const step = Math.min(dt, 0.1);
    const moving = smoothstep(0.08, 0.45, motion.speed);
    const run = motion.running ? 1 : 0;
    const target: Record<LoopClip, number> = {
      walk: moving * (1 - run),
      run: moving * run,
      turn: (1 - moving) * smoothstep(0.6, 2.2, Math.abs(motion.turnRate)),
      idle: 0,
    };
    target.idle = Math.max(0, 1 - target.walk - target.run - target.turn);
    const k = 1 - Math.exp(-9 * step);
    for (const name of LOOPS) {
      this.weights[name] += (target[name] - this.weights[name]) * k;
      this.actions[name].setEffectiveWeight(this.weights[name]);
    }

    // Match cadence to ground speed so feet don't skate, and keep walk and
    // run in phase so blending between them doesn't scissor the legs.
    const walk = this.actions.walk;
    const runA = this.actions.run;
    walk.timeScale = Math.max(0.55, Math.min(2.2, motion.speed / WALK_REF_SPEED));
    runA.timeScale = Math.max(0.7, Math.min(1.6, motion.speed / RUN_REF_SPEED));
    if (this.weights.walk >= this.weights.run) runA.time = (walk.time / WALK_CYCLE) * RUN_CYCLE;
    else walk.time = (runA.time / RUN_CYCLE) * WALK_CYCLE;

    const wave = this.actions.wave;
    if (this.waveFading === false && wave.isRunning() && wave.time > wave.getClip().duration - 0.35) {
      this.waveFading = true;
      wave.fadeOut(0.3);
    }
    this.mixer.update(step);
  }

  /** Friendly wave (ignored while one is already playing). */
  wave() {
    const wave = this.actions.wave;
    if (wave.isRunning()) return;
    wave.reset();
    // Weighted above the locomotion clips so the arm follows the gesture.
    wave.setEffectiveWeight(4);
    wave.fadeIn(0.25);
    wave.play();
    this.waveFading = false;
  }

  setShadowOpacity(opacity: number) {
    this.shadowMaterial.opacity = opacity;
  }

  dispose() {
    this.mixer.stopAllAction();
    this.mixer.uncacheRoot(this.figure);
    this.build.dispose();
    this.shadowMaterial.dispose();
    this.root.removeFromParent();
  }
}
