"use client";

import { useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import {
  checkPlacement,
  defaultPrintWidth,
  outerSize,
  sizeForAspect,
  snapPlacement,
  type FrameOptions,
  type PlacementProblem,
} from "@/features/photo-placement/placement";
import { computeWallSpec, type WallKey } from "@/features/rooms/geometry";
import { photoImageUrl } from "@/components/museum/photo-urls";
import { useMuseumStore } from "@/store/museum-store";
import { input } from "@/three/controls/input";
import { frameWorldMatrix } from "@/three/frames/frames-renderer";
import { toPlacementList } from "./placement-helpers";
import { useWorld } from "./MuseumWorld";

export type AimProblem = PlacementProblem | "aim_wall" | "too_far";

export interface PlacementConfirm {
  photoId: string;
  roomId: string;
  wallKey: WallKey;
  u: number;
  v: number;
  width: number;
  options: FrameOptions;
}

const MAX_DISTANCE = 7;

/**
 * "Place on wall" while exploring: aims from the centre of the view, shows a
 * ghost frame with the real photo, and confirms on click / E / the HUD button.
 */
export function PlacementTool({ onConfirm }: { onConfirm: (p: PlacementConfirm) => void }) {
  const { camera } = useThree();
  const { scene, pickers } = useWorld();
  const placement = useMuseumStore((s) => s.placement);
  const setPlacement = useMuseumStore((s) => s.setPlacement);
  const group = useRef<THREE.Group>(null);
  const raycaster = useMemo(() => new THREE.Raycaster(), []);
  const last = useRef<string>("");
  const confirmRef = useRef<PlacementConfirm | null>(null);
  const photo = placement ? scene.photos.find((p) => p.id === placement.photoId) : null;

  const photoMaterial = useMemo(() => new THREE.MeshBasicMaterial({ color: "#ffffff", transparent: true, opacity: 0.92, toneMapped: false }), []);
  const outlineMaterial = useMemo(() => new THREE.MeshBasicMaterial({ color: "#7bd389", transparent: true, opacity: 0.85, toneMapped: false, depthTest: false }), []);
  const plane = useMemo(() => new THREE.PlaneGeometry(1, 1), []);
  const ring = useMemo(() => {
    const shape = new THREE.Shape();
    shape.moveTo(-0.5, -0.5);
    shape.lineTo(0.5, -0.5);
    shape.lineTo(0.5, 0.5);
    shape.lineTo(-0.5, 0.5);
    shape.closePath();
    const hole = new THREE.Path();
    hole.moveTo(-0.47, -0.47);
    hole.lineTo(-0.47, 0.47);
    hole.lineTo(0.47, 0.47);
    hole.lineTo(0.47, -0.47);
    hole.closePath();
    shape.holes.push(hole);
    return new THREE.ShapeGeometry(shape);
  }, []);

  // Load the photo's thumbnail onto the ghost frame.
  useEffect(() => {
    if (!photo) return;
    const url = photoImageUrl(photo, "thumb");
    photoMaterial.color.set(photo.dominantColor);
    photoMaterial.map = null;
    photoMaterial.needsUpdate = true;
    if (!url) return;
    const tex = new THREE.TextureLoader().setCrossOrigin("anonymous").load(url, () => {
      photoMaterial.color.set("#ffffff");
      photoMaterial.needsUpdate = true;
    });
    tex.colorSpace = THREE.SRGBColorSpace;
    photoMaterial.map = tex;
    return () => tex.dispose();
  }, [photo, photoMaterial]);

  useEffect(() => {
    input.placementMode = Boolean(placement);
    return () => {
      input.placementMode = false;
    };
  }, [placement]);

  useEffect(
    () => () => {
      plane.dispose();
      ring.dispose();
      photoMaterial.dispose();
      outlineMaterial.dispose();
    },
    [plane, ring, photoMaterial, outlineMaterial],
  );

  useFrame(() => {
    const g = group.current;
    if (!g) return;
    if (!placement || !photo) {
      g.visible = false;
      return;
    }
    raycaster.setFromCamera(new THREE.Vector2(0, 0), camera);
    raycaster.far = 30;
    const hit = pickers.current ? raycaster.intersectObjects(pickers.current.children, false)[0] : undefined;
    const ray = raycaster.ray;
    const room = hit ? scene.rooms.find((r) => r.id === hit.object.userData.roomId) : null;
    // A floor or ceiling in front of the wall means the visitor is not aiming at a wall.
    const tFloor = ray.direction.y < -1e-4 ? -ray.origin.y / ray.direction.y : Infinity;
    const tCeiling = room && ray.direction.y > 1e-4 ? (room.height - ray.origin.y) / ray.direction.y : Infinity;

    let problem: AimProblem | null = null;
    let result: PlacementConfirm | null = null;
    if (!hit || !room || tFloor < hit.distance || tCeiling < hit.distance) problem = "aim_wall";
    else if (hit.distance > MAX_DISTANCE) problem = "too_far";
    else {
      const wallKey = hit.object.userData.wallKey as WallKey;
      const local = hit.object.worldToLocal(hit.point.clone());
      const aspect = photo.width / photo.height;
      const size = sizeForAspect(aspect, defaultPrintWidth(aspect, room.height) * (placement.scale ?? 1), Math.min(1.9, room.height - 1.3));
      const options: FrameOptions = { showPlaque: Boolean(photo.title) };
      const others = toPlacementList(scene.frames.filter((f) => f.roomId === room.id && f.wallKey === wallKey));
      const snapped = snapPlacement({ ...size, u: local.x, v: local.y + room.height / 2, rotation: 0, style: scene.theme.defaultFrameStyle, options }, others).placement;
      const check = checkPlacement(computeWallSpec(room, wallKey).bounds, snapped, others);
      if (!check.ok) problem = check.problem ?? "out_of_bounds";
      result = { photoId: photo.id, roomId: room.id, wallKey, u: snapped.u, v: snapped.v, width: snapped.width, options };
      // Position the ghost on the wall.
      const m = frameWorldMatrix(room, { wallKey, u: snapped.u, v: snapped.v, rotation: 0 }, scene.theme.wainscot ? 0.022 : 0);
      const o = outerSize(snapped);
      g.matrixAutoUpdate = false;
      g.matrix.copy(m).multiply(new THREE.Matrix4().makeTranslation(0, 0, 0.03));
      g.children[0]!.scale.set(snapped.width, snapped.height, 1);
      g.children[1]!.scale.set(o.width + 0.06, o.height + 0.06, 1);
      g.children[1]!.position.set(0, o.centreDy, 0.001);
    }
    g.visible = Boolean(result);
    outlineMaterial.color.set(problem ? "#e06a6a" : "#7bd389");
    confirmRef.current = problem ? null : result;

    // Only the status matters to the HUD; avoid a React update every frame.
    const key = problem ?? "ok";
    if (key !== last.current || !placement.preview) {
      last.current = key;
      setPlacement({
        ...placement,
        preview: result
          ? { roomId: result.roomId, wallId: "", wallKey: result.wallKey, u: result.u, v: result.v, width: result.width, height: 0, valid: !problem, problem: problem ?? undefined }
          : { roomId: "", wallId: "", wallKey: "", u: 0, v: 0, width: 0, height: 0, valid: false, problem: problem ?? "aim_wall" },
      });
    }

    if (input.interactRequested) {
      input.interactRequested = false;
      if (confirmRef.current) onConfirm(confirmRef.current);
    }
  });

  // Exposed for the HUD button (touch devices have no crosshair click).
  useEffect(() => {
    const confirm = () => confirmRef.current && onConfirm(confirmRef.current);
    window.addEventListener("om:placement-confirm", confirm);
    return () => window.removeEventListener("om:placement-confirm", confirm);
  }, [onConfirm]);

  return (
    <group ref={group} visible={false}>
      <mesh geometry={plane} material={photoMaterial} renderOrder={5} />
      <mesh geometry={ring} material={outlineMaterial} renderOrder={6} />
    </group>
  );
}
