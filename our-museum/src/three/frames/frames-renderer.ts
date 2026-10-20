"use client";

/**
 * Imperative renderer for picture frames. Frames are diffed by signature so an
 * edit only rebuilds the frames that changed — the rest of the scene is left
 * untouched. Shadows and light washes are instanced (one draw call each).
 */
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { frameMetrics, outerSize, type FrameStyle } from "@/features/photo-placement/placement";
import type { SceneFrame, ScenePhoto, SceneRoom } from "@/features/museums/scene-types";
import { wallTransform } from "@/features/rooms/geometry";
import { frameShadowTexture, plaqueTexture, washTexture } from "@/three/materials/textures";
import type { PhotoTextureManager } from "@/three/loaders/photo-textures";

export interface FrameRuntime {
  id: string;
  photoId: string;
  roomId: string;
  center: THREE.Vector3;
  normal: THREE.Vector3;
  outerWidth: number;
  outerHeight: number;
}

interface FrameEntry {
  sig: string;
  frame: SceneFrame;
  group: THREE.Group;
  photoMesh: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  ownGeometries: THREE.BufferGeometry[];
  plaque: THREE.Mesh | null;
  plaqueTexture: THREE.Texture | null;
  runtime: FrameRuntime;
  matrix: THREE.Matrix4;
  currentTexture: THREE.Texture | null;
}

const unitPlane = new THREE.PlaneGeometry(1, 1);
const unitBox = new THREE.BoxGeometry(1, 1, 1);
const yAxis = new THREE.Vector3(0, 1, 0);

const materialCache = new Map<string, THREE.Material>();
function standard(color: string, roughness: number, metalness: number) {
  const key = `${color}:${roughness}:${metalness}`;
  let m = materialCache.get(key);
  if (!m) {
    m = new THREE.MeshStandardMaterial({ color, roughness, metalness });
    materialCache.set(key, m);
  }
  return m;
}

function shade(hex: string, k: number) {
  const c = new THREE.Color(hex);
  c.multiplyScalar(k);
  return `#${c.getHexString()}`;
}

function boxGeo(w: number, h: number, d: number, x: number, y: number, z: number) {
  const g = unitBox.clone();
  g.scale(Math.max(w, 1e-4), Math.max(h, 1e-4), Math.max(d, 1e-4));
  g.translate(x, y, z);
  return g;
}

/** World matrix of a frame's local origin (photo centre on the wall surface). */
export function frameWorldMatrix(room: SceneRoom, frame: Pick<SceneFrame, "wallKey" | "u" | "v" | "rotation">, wallOffset: number) {
  const t = wallTransform(room, frame.wallKey);
  const roomM = new THREE.Matrix4().compose(
    new THREE.Vector3(room.positionX, 0, room.positionZ),
    new THREE.Quaternion().setFromAxisAngle(yAxis, (room.rotation * Math.PI) / 180),
    new THREE.Vector3(1, 1, 1),
  );
  const wallM = new THREE.Matrix4().compose(
    new THREE.Vector3(...t.position),
    new THREE.Quaternion().setFromAxisAngle(yAxis, t.rotationY),
    new THREE.Vector3(1, 1, 1),
  );
  const local = new THREE.Matrix4().compose(
    new THREE.Vector3(frame.u, frame.v, wallOffset),
    new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), (frame.rotation * Math.PI) / 180),
    new THREE.Vector3(1, 1, 1),
  );
  return roomM.multiply(wallM).multiply(local);
}

export interface FramesRendererOptions {
  wallOffset: number;
  lightColor: string;
  washOpacity: number;
  photoBrightness: number;
  rtl: boolean;
  plaqueSubtitle: (frame: SceneFrame, photo: ScenePhoto | undefined) => string;
}

export class FramesRenderer {
  readonly group = new THREE.Group();
  private entries = new Map<string, FrameEntry>();
  private shadows: THREE.InstancedMesh | null = null;
  private washes: THREE.InstancedMesh | null = null;
  private outline: THREE.Mesh | null = null;
  private focusedId: string | null = null;
  private photos = new Map<string, ScenePhoto>();
  private lastLod = 0;
  private readonly tmp = new THREE.Vector3();

  constructor(
    private readonly textures: PhotoTextureManager,
    private options: FramesRendererOptions,
  ) {
    this.group.name = "frames";
  }

  get runtimes(): FrameRuntime[] {
    return [...this.entries.values()].map((e) => e.runtime);
  }

  setOptions(options: FramesRendererOptions) {
    const changed = JSON.stringify({ ...options, plaqueSubtitle: 0 }) !== JSON.stringify({ ...this.options, plaqueSubtitle: 0 });
    this.options = options;
    return changed;
  }

  sync(frames: SceneFrame[], rooms: Map<string, SceneRoom>, photos: Map<string, ScenePhoto>, force = false) {
    this.photos = photos;
    const seen = new Set<string>();
    for (const frame of frames) {
      const room = rooms.get(frame.roomId);
      const photo = photos.get(frame.photoId);
      if (!room || !photo) continue;
      seen.add(frame.id);
      const sig = JSON.stringify([
        frame.u,
        frame.v,
        frame.rotation,
        frame.width,
        frame.height,
        frame.style,
        frame.options,
        frame.caption,
        frame.photoId,
        frame.wallKey,
        room.positionX,
        room.positionZ,
        room.rotation,
        room.width,
        room.depth,
        photo.title,
        photo.dominantColor,
        this.options.wallOffset,
      ]);
      const existing = this.entries.get(frame.id);
      if (existing && existing.sig === sig && !force) {
        existing.frame = frame;
        continue;
      }
      if (existing) this.removeEntry(existing);
      this.entries.set(frame.id, this.buildEntry(frame, room, photo, sig));
    }
    for (const [id, entry] of this.entries) if (!seen.has(id)) this.removeEntry(entry);
    this.rebuildDecals();
    if (this.focusedId && !this.entries.has(this.focusedId)) this.setFocus(null);
    else if (this.focusedId) this.setFocus(this.focusedId, true);
  }

  private buildEntry(frame: SceneFrame, room: SceneRoom, photo: ScenePhoto, sig: string): FrameEntry {
    const style = frame.style as FrameStyle;
    const m = frameMetrics(style, frame.options);
    const outer = outerSize(frame);
    const cy = outer.centreDy;
    const group = new THREE.Group();
    const own: THREE.BufferGeometry[] = [];
    const add = (geo: THREE.BufferGeometry, mat: THREE.Material) => {
      own.push(geo);
      const mesh = new THREE.Mesh(geo, mat);
      group.add(mesh);
      return mesh;
    };

    const ow = outer.width;
    const oh = outer.height;
    const d = m.depth;
    let photoZ: number;
    if (style === "frameless-canvas") {
      // Gallery-wrapped canvas: photo on the front face of a shallow box.
      add(boxGeo(frame.width, frame.height, d, 0, 0, d / 2), standard(shade(photo.dominantColor, 0.85), 0.85, 0));
      photoZ = d + 0.0012;
    } else if (style === "polaroid") {
      add(boxGeo(ow, oh, d, 0, cy, d / 2), standard(m.matColor, m.roughness, 0));
      photoZ = d + 0.0008;
    } else {
      const b = m.border;
      const borderParts = [
        boxGeo(ow, b, d, 0, cy + oh / 2 - b / 2, d / 2),
        boxGeo(ow, b, d, 0, cy - oh / 2 + b / 2, d / 2),
        boxGeo(b, oh - 2 * b, d, -ow / 2 + b / 2, cy, d / 2),
        boxGeo(b, oh - 2 * b, d, ow / 2 - b / 2, cy, d / 2),
      ];
      const border = mergeGeometries(borderParts);
      borderParts.forEach((p) => p.dispose());
      add(border, standard(m.borderColor, m.roughness, m.metalness));
      // Inner lip gives the moulding a stepped profile.
      const lip = 0.012;
      const iw = ow - 2 * b;
      const ih = oh - 2 * b;
      const lipColor = style === "champagne-gold" ? shade(m.borderColor, 0.78) : style === "natural-wood" ? shade(m.borderColor, 0.7) : shade(m.borderColor, style === "white-gallery" ? 0.92 : 1.6);
      const lipParts = [
        boxGeo(iw, lip, d * 0.8, 0, cy + ih / 2 - lip / 2, d * 0.4),
        boxGeo(iw, lip, d * 0.8, 0, cy - ih / 2 + lip / 2, d * 0.4),
        boxGeo(lip, ih - 2 * lip, d * 0.8, -iw / 2 + lip / 2, cy, d * 0.4),
        boxGeo(lip, ih - 2 * lip, d * 0.8, iw / 2 - lip / 2, cy, d * 0.4),
      ];
      const lipGeo = mergeGeometries(lipParts);
      lipParts.forEach((p) => p.dispose());
      add(lipGeo, standard(lipColor, m.roughness, m.metalness * 0.9));
      const matDepth = d * 0.45;
      add(boxGeo(iw, ih, matDepth, 0, cy, matDepth / 2), standard(m.matColor, 0.9, 0));
      photoZ = matDepth + 0.0012;
    }

    const photoMat = new THREE.MeshBasicMaterial({ color: photo.dominantColor, toneMapped: false });
    const photoMesh = new THREE.Mesh(unitPlane, photoMat);
    photoMesh.scale.set(frame.width, frame.height, 1);
    photoMesh.position.set(0, 0, photoZ);
    photoMesh.userData = { frameId: frame.id };
    group.add(photoMesh);

    let plaque: THREE.Mesh | null = null;
    if (frame.options?.showPlaque) {
      plaque = new THREE.Mesh(unitBox, standard("#f3efe6", 0.7, 0));
      plaque.scale.set(0.24, 0.09, 0.008);
      plaque.position.set(Math.min(ow / 2 - 0.12, 0.6), cy - oh / 2 - 0.085, 0.004);
      group.add(plaque);
    }

    const matrix = frameWorldMatrix(room, frame, this.options.wallOffset);
    group.matrixAutoUpdate = false;
    group.matrix.copy(matrix);
    this.group.add(group);

    const center = new THREE.Vector3(0, 0, photoZ).applyMatrix4(matrix);
    const normal = new THREE.Vector3(0, 0, 1).transformDirection(matrix);
    return {
      sig,
      frame,
      group,
      photoMesh,
      ownGeometries: own,
      plaque,
      plaqueTexture: null,
      currentTexture: null,
      matrix,
      runtime: { id: frame.id, photoId: frame.photoId, roomId: frame.roomId, center, normal, outerWidth: ow, outerHeight: oh },
    };
  }

  private removeEntry(entry: FrameEntry) {
    this.group.remove(entry.group);
    entry.ownGeometries.forEach((g) => g.dispose());
    entry.photoMesh.material.dispose();
    if (entry.plaque && entry.plaqueTexture) {
      (entry.plaque.material as THREE.Material).dispose();
      entry.plaqueTexture.dispose();
    }
    this.entries.delete(entry.frame.id);
  }

  private rebuildDecals() {
    for (const mesh of [this.shadows, this.washes]) {
      if (mesh) {
        this.group.remove(mesh);
        mesh.dispose();
      }
    }
    const list = [...this.entries.values()];
    if (!list.length) {
      this.shadows = this.washes = null;
      return;
    }
    const shadowMat = new THREE.MeshBasicMaterial({
      map: frameShadowTexture(),
      color: "#000000",
      transparent: true,
      opacity: 0.32,
      depthWrite: false,
      toneMapped: false,
    });
    const washMat = new THREE.MeshBasicMaterial({
      map: washTexture(),
      color: this.options.lightColor,
      transparent: true,
      opacity: this.options.washOpacity,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
    });
    this.shadows = new THREE.InstancedMesh(unitPlane, shadowMat, list.length);
    this.washes = new THREE.InstancedMesh(unitPlane, washMat, list.length);
    const local = new THREE.Matrix4();
    const out = new THREE.Matrix4();
    list.forEach((e, i) => {
      const o = outerSize(e.frame);
      local.compose(new THREE.Vector3(0.025, o.centreDy - 0.035, 0.0015), new THREE.Quaternion(), new THREE.Vector3(o.width * 1.45, o.height * 1.45, 1));
      out.multiplyMatrices(e.matrix, local);
      this.shadows!.setMatrixAt(i, out);
      local.compose(new THREE.Vector3(0, o.centreDy + o.height * 0.18, 0.003), new THREE.Quaternion(), new THREE.Vector3(o.width * 1.9 + 0.5, o.height * 1.7 + 0.7, 1));
      out.multiplyMatrices(e.matrix, local);
      this.washes!.setMatrixAt(i, out);
    });
    this.shadows.instanceMatrix.needsUpdate = true;
    this.washes.instanceMatrix.needsUpdate = true;
    this.shadows.renderOrder = 1;
    this.washes.renderOrder = 2;
    // Instanced bounds are not computed automatically.
    this.shadows.computeBoundingSphere();
    this.washes.computeBoundingSphere();
    this.group.add(this.shadows, this.washes);
  }

  setFocus(id: string | null, force = false) {
    if (id === this.focusedId && !force) return;
    this.focusedId = id;
    if (this.outline) {
      this.group.remove(this.outline);
      this.outline.geometry.dispose();
      this.outline = null;
    }
    const entry = id ? this.entries.get(id) : null;
    if (!entry) return;
    const o = outerSize(entry.frame);
    const pad = 0.035;
    const t = 0.012;
    const w = o.width + 2 * pad;
    const h = o.height + 2 * pad;
    const parts = [
      boxGeo(w, t, 0.004, 0, o.centreDy + h / 2, 0.002),
      boxGeo(w, t, 0.004, 0, o.centreDy - h / 2, 0.002),
      boxGeo(t, h, 0.004, -w / 2, o.centreDy, 0.002),
      boxGeo(t, h, 0.004, w / 2, o.centreDy, 0.002),
    ];
    const geo = mergeGeometries(parts);
    parts.forEach((p) => p.dispose());
    this.outline = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: "#e2c48a", toneMapped: false }));
    this.outline.matrixAutoUpdate = false;
    this.outline.matrix.copy(entry.matrix);
    this.group.add(this.outline);
  }

  setOutlineVisible(visible: boolean) {
    if (this.outline) this.outline.visible = visible;
  }

  /** Per-frame update: texture LOD, distance culling and lazy plaques. */
  update(camera: THREE.Camera, now: number) {
    if (now - this.lastLod < 250) return;
    this.lastLod = now;
    camera.getWorldPosition(this.tmp);
    let plaquesThisTick = 0;
    for (const e of this.entries.values()) {
      const dist = this.tmp.distanceTo(e.runtime.center);
      e.group.visible = dist < 45;
      if (!e.group.visible) continue;
      const photo = this.photos.get(e.frame.photoId);
      if (!photo) continue;
      const priority = 100 - dist;
      let tex: THREE.Texture | null = null;
      if (dist < 7) tex = this.textures.request(photo, "medium", priority + 50);
      if (!tex && dist < 32) tex = this.textures.request(photo, "thumb", priority);
      if (tex && tex !== e.currentTexture) {
        e.photoMesh.material.map = tex;
        e.photoMesh.material.color.setScalar(this.options.photoBrightness);
        e.photoMesh.material.needsUpdate = true;
        e.currentTexture = tex;
      }
      if (e.plaque && !e.plaqueTexture && dist < 6 && plaquesThisTick < 2) {
        plaquesThisTick++;
        const title = e.frame.caption || photo.title || "";
        e.plaqueTexture = plaqueTexture(title, this.options.plaqueSubtitle(e.frame, photo), this.options.rtl);
        const mat = new THREE.MeshStandardMaterial({ map: e.plaqueTexture, roughness: 0.7 });
        e.plaque.material = mat;
      }
    }
    this.textures.pump();
  }

  /** Raycasts the photo planes; returns the hit frame id. */
  pick(raycaster: THREE.Raycaster): string | null {
    const meshes = [...this.entries.values()].filter((e) => e.group.visible).map((e) => e.photoMesh);
    const hit = raycaster.intersectObjects(meshes, false)[0];
    return (hit?.object.userData.frameId as string | undefined) ?? null;
  }

  dispose() {
    for (const e of [...this.entries.values()]) this.removeEntry(e);
    for (const mesh of [this.shadows, this.washes]) {
      if (mesh) {
        (mesh.material as THREE.Material).dispose();
        mesh.dispose();
      }
    }
    this.setFocus(null);
  }
}
