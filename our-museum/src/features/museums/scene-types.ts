import type { AvatarConfig } from "@/features/avatars/config";
import type { Action, Role } from "@/lib/permissions";
import type { FrameOptions, FrameStyle } from "@/features/photo-placement/placement";
import type { RoomShape, WallKey } from "@/features/rooms/geometry";
import type { PrivacyConfig, ResolvedTheme, ThemeOverrides } from "./theme";

/** Procedurally painted sample artwork (demo museum only — never user content). */
export interface SampleArtSpec {
  kind: "landscape" | "sea" | "sunset" | "garden" | "night" | "abstract" | "dunes" | "city";
  seed: number;
}

export interface ScenePhoto {
  id: string;
  title: string;
  caption: string;
  takenAt: string | null;
  width: number;
  height: number;
  dominantColor: string;
  /** Short-lived signed URLs; null for demo sample art. */
  urls: { thumb: string; medium: string; large: string } | null;
  sample?: SampleArtSpec;
  uploadedById: string | null;
  createdAt: string;
  collectionIds: string[];
  favorite: boolean;
  reactions: Record<string, number>;
  myReactions: string[];
}

export interface SceneWall {
  id: string;
  wallKey: WallKey;
}

export interface SceneRoom extends RoomShape {
  walls: SceneWall[];
}

export interface SceneFrame {
  id: string;
  roomId: string;
  wallId: string;
  wallKey: WallKey;
  photoId: string;
  u: number;
  v: number;
  rotation: number;
  width: number;
  height: number;
  style: FrameStyle;
  options: FrameOptions;
  caption: string | null;
  /** Edit version, sent back with changes so stale edits are refused. */
  version: number;
}

export interface SceneCollection {
  id: string;
  name: string;
  description: string;
  sortOrder: number;
  photoIds: string[];
}

export interface SceneTour {
  id: string;
  name: string;
  description: string;
  stops: Array<{ id: string; frameId: string; note: string }>;
}

export interface SceneViewer {
  userId: string | null;
  displayName: string;
  role: Role | null;
  isGuest: boolean;
  permissions: Record<Action, boolean>;
  /** The viewer's own avatar (seeded default until they customise it). */
  avatar: AvatarConfig;
}

export interface SceneData {
  museum: {
    id: string;
    name: string;
    description: string;
    templateId: string;
    ownerId: string | null;
    ownerName: string;
    themeOverrides: ThemeOverrides;
    privacy: PrivacyConfig;
    layoutVersion: number;
    coverPhotoId: string | null;
  };
  theme: ResolvedTheme;
  rooms: SceneRoom[];
  frames: SceneFrame[];
  photos: ScenePhoto[];
  collections: SceneCollection[];
  tours: SceneTour[];
  viewer: SceneViewer;
  spawn: { x: number; z: number; yaw: number };
  isDemo: boolean;
  /** When the signed photo URLs expire (client refreshes before then). */
  urlsExpireAt: string | null;
}
