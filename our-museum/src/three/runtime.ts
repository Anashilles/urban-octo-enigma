/**
 * High-frequency runtime state of the local player, shared between the 3D
 * scene (writer) and HTML overlays / networking (readers). Not React state.
 */
export interface PlayerPose {
  x: number;
  z: number;
  yaw: number;
  pitch: number;
  /** Horizontal speed in m/s (drives the avatar animation). */
  speed: number;
  moving: boolean;
  running: boolean;
  roomId: string | null;
}

export const player: PlayerPose = { x: 0, z: 0, yaw: 0, pitch: 0, speed: 0, moving: false, running: false, roomId: null };

/** Teleport/glide requests from the UI (Go to photo, tours, return to position). */
export interface MoveRequest {
  x: number;
  z: number;
  yaw: number;
  pitch?: number;
  /** Glide over this many seconds instead of jumping (0 = instant). */
  duration: number;
}

export const pending: { move: MoveRequest | null } = { move: null };

export function requestMove(move: MoveRequest) {
  pending.move = move;
}

/** Test hooks (enabled with NEXT_PUBLIC_ENABLE_TEST_HOOKS=true) — read-only views for E2E tests. */
export function exposeTestHooks(extra: Record<string, unknown>) {
  if (process.env.NEXT_PUBLIC_ENABLE_TEST_HOOKS !== "true" || typeof window === "undefined") return;
  (window as unknown as { __museum?: Record<string, unknown> }).__museum = {
    player: () => ({ ...player }),
    ...extra,
  };
}
