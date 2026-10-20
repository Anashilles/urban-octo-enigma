/**
 * Builds a complete, clearly labelled sample museum in the browser — used by
 * the public demo and the landing-page preview. No database, no user photos.
 */
import { defaultAvatar } from "@/features/avatars/config";
import { ACTIONS, type Action } from "@/lib/permissions";
import type { Translator } from "@/i18n/translate";
import {
  defaultPrintWidth,
  findFreeSpot,
  sizeForAspect,
  type FramePlacement,
  type FrameStyle,
} from "@/features/photo-placement/placement";
import { computeWallSpecs, type WallKey } from "@/features/rooms/geometry";
import type { SampleArtSpec, SceneData, SceneFrame, ScenePhoto, SceneRoom } from "./scene-types";
import { buildTemplateRooms, TEMPLATES, type RoomKey, type TemplateId } from "./templates";

const ASPECTS = [3 / 2, 2 / 3, 4 / 3, 1, 16 / 9, 4 / 5, 3 / 4, 5 / 4];
const KINDS: SampleArtSpec["kind"][] = ["landscape", "sea", "sunset", "garden", "night", "abstract", "dunes", "city"];
const DOMINANT: Record<SampleArtSpec["kind"], string> = {
  landscape: "#9fb3b0",
  sea: "#6f96a0",
  sunset: "#b5706b",
  garden: "#9fb08f",
  night: "#2c2f45",
  abstract: "#c9a27a",
  dunes: "#dcb183",
  city: "#9c9fae",
};

function styleFor(roomKey: RoomKey, i: number, fallback: FrameStyle): FrameStyle {
  if (roomKey === "special") return "champagne-gold";
  if (roomKey === "personal") return i % 2 ? "polaroid" : fallback;
  if (roomKey === "couples") return i % 3 === 0 ? "white-gallery" : fallback;
  if (roomKey === "travel") return i % 2 ? "natural-wood" : fallback;
  return fallback;
}

export function buildDemoScene(templateId: TemplateId, t: Translator, photoCount = 40): SceneData {
  const template = TEMPLATES[templateId];
  const rooms = buildTemplateRooms(templateId, (k) => t(`templates.rooms.${k}`), (k) => `demo-${k}`);
  const sceneRooms: SceneRoom[] = rooms.map((r) => ({
    ...r,
    walls: (["north", "east", "south", "west"] as WallKey[]).map((w) => ({ id: `${r.id}-${w}`, wallKey: w })),
  }));

  const photos: ScenePhoto[] = Array.from({ length: photoCount }, (_, i) => {
    const kind = KINDS[i % KINDS.length]!;
    const aspect = ASPECTS[(i * 3) % ASPECTS.length]!;
    const height = 1200;
    return {
      id: `sample-${i + 1}`,
      title: `${t(`demo.art.${kind}`)} ${i + 1}`,
      caption: t("demo.sampleCaption"),
      takenAt: new Date(Date.UTC(2015 + (i % 10), (i * 5) % 12, 1 + (i % 27))).toISOString(),
      width: Math.round(height * aspect),
      height,
      dominantColor: DOMINANT[kind],
      urls: null,
      sample: { kind, seed: 101 + i * 17 },
      uploadedById: null,
      createdAt: new Date(0).toISOString(),
      collectionIds: [`demo-col-${i % 3}`],
      favorite: false,
      reactions: {},
      myReactions: [],
    };
  });

  const frames: SceneFrame[] = [];
  let next = 0;
  for (const room of rooms) {
    const walls = computeWallSpecs(room)
      .map((w) => ({ w, usable: w.bounds.maxU - w.bounds.minU - w.bounds.exclusions.reduce((s, x) => s + (x.maxU - x.minU), 0) }))
      .filter((x) => x.usable > 1.6)
      .sort((a, b) => b.usable - a.usable)
      .slice(0, room.key === "lobby" ? 2 : 4);
    for (const { w, usable } of walls) {
      const placed: Array<FramePlacement & { id: string }> = [];
      const perWall = Math.max(1, Math.min(4, Math.floor(usable / 2.8)));
      for (let k = 0; k < perWall && next < photos.length; k++) {
        const photo = photos[next]!;
        const aspect = photo.width / photo.height;
        const scale = room.roomType === "hall" ? 1.3 : room.roomType === "reflection" ? 0.85 : 1;
        const size = sizeForAspect(aspect, defaultPrintWidth(aspect, room.height) * scale, Math.min(1.9, room.height - 1.4));
        const style = styleFor(room.key, frames.length, template.theme.defaultFrameStyle);
        const spot = findFreeSpot(w.bounds, { ...size, style, options: { showPlaque: true } }, placed);
        if (!spot) break;
        const frame: SceneFrame = {
          id: `demo-frame-${frames.length + 1}`,
          roomId: room.id,
          wallId: `${room.id}-${w.wallKey}`,
          wallKey: w.wallKey,
          photoId: photo.id,
          u: spot.u,
          v: spot.v,
          rotation: 0,
          width: spot.width,
          height: spot.height,
          style,
          options: { showPlaque: true },
          caption: null,
        };
        placed.push({ ...spot, id: frame.id });
        frames.push(frame);
        next++;
      }
    }
  }

  const permissions = Object.fromEntries(ACTIONS.map((a) => [a, false])) as Record<Action, boolean>;
  return {
    museum: {
      id: `demo-${templateId}`,
      name: t(`templates.${templateId}.name`),
      description: t(`templates.${templateId}.description`),
      templateId,
      ownerId: null,
      ownerName: t("common.appName"),
      themeOverrides: {},
      privacy: { guestsCanStartSharedViewing: true, allowAnonymousGuests: false, voiceChatEnabled: false, reactionsEnabled: false },
      layoutVersion: 1,
      coverPhotoId: null,
    },
    theme: template.theme,
    rooms: sceneRooms,
    frames,
    photos: photos.filter((p) => frames.some((f) => f.photoId === p.id)),
    collections: [0, 1, 2].map((i) => ({
      id: `demo-col-${i}`,
      name: t(`templates.collections.${(["ourStory", "places", "favorites"] as const)[i]!}`),
      description: "",
      sortOrder: i,
      photoIds: photos.filter((_, j) => j % 3 === i).map((p) => p.id),
    })),
    tours: frames.length
      ? [
          {
            id: "demo-tour",
            name: t("demo.tourName"),
            description: t("demo.tourDescription"),
            stops: (["a", "b", "c", "d"] as const)
              .map((k, i) => ({ id: `demo-stop-${k}`, frameId: frames[Math.min(frames.length - 1, i * 2)]!.id, note: t(`demo.tourNotes.${k}`) }))
              .filter((s, i, all) => all.findIndex((x) => x.frameId === s.frameId) === i),
          },
        ]
      : [],
    viewer: { userId: null, displayName: "", role: null, isGuest: true, permissions, avatar: defaultAvatar("demo-visitor") },
    spawn: template.spawn,
    isDemo: true,
    urlsExpireAt: null,
  };
}
