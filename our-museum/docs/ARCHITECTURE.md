# Architecture

Our Museum is two processes sharing one PostgreSQL database and one object
store:

```
 Browser ──HTTPS──▶ Web app (Next.js 16)  ──▶ PostgreSQL
    │                  │  │                 └─▶ Object storage (local disk or S3)
    │                  │  └─ POST /internal/* (signed JWT) ─┐
    └──WSS (ticket)──▶ Realtime service (ws) ◀──────────────┘
    └──WebRTC (peer to peer, optional TURN)── other browsers (voice)
```

- **Web app** (`src/`) — pages, REST API, authentication, uploads, image
  processing, every authorisation decision.
- **Realtime service** (`realtime/`) — a small stateless WebSocket relay for
  presence, movement, Look Together, live tours, reactions and voice
  signalling. It has no database access and holds only the ticket secret.
- **Voice** flows directly between browsers (WebRTC mesh); the realtime
  service relays only signalling messages.

## Source layout

| Path | Contents |
| --- | --- |
| `src/app` | App Router pages (`(app)`, `(auth)`, `museum`, `editor`, `demo`) and API routes (`api/**/route.ts`) |
| `src/services` | Domain services — the only code that touches the database or storage |
| `src/lib` | Environment validation, permissions table, API handler (errors, CSRF, rate limits), auth, email, logger |
| `src/features` | Feature modules shared by client and server: museum templates and geometry, photo placement, avatar config, realtime protocol and client, voice manager, ambient audio |
| `src/three` | 3D runtime: rooms, frames, avatars, controls, texture loading |
| `src/components` | React UI (museum HUD, editor tabs, live UI, avatar editor, dashboard, shadcn-style primitives) |
| `src/store` | Zustand stores (scene, preferences, realtime, voice) |
| `src/i18n` | English and Arabic messages, locale detection |
| `realtime` | WebSocket server (`server.ts`) and the transport-independent room logic (`hub.ts`) |
| `prisma` | Schema, migrations, seed |
| `tests` | `unit`, `integration` (real PostgreSQL), `e2e` (Playwright) |

## Request path

Every API route is wrapped by `apiHandler` (`src/lib/api/handler.ts`), which:

1. rejects cross-site mutations (`Origin` / `Sec-Fetch-Site` must match the app),
2. resolves the Better Auth session,
3. applies a per-user or per-IP token-bucket rate limit,
4. validates the body with zod,
5. maps domain errors to JSON `{ error: { code, message } }` with the right status.

Services then load the caller's membership and check the action against the
single permissions table in `src/lib/permissions` (`OWNER`, `EDITOR`,
`VISITOR`). The UI reads the same table only to hide controls.

`src/proxy.ts` (Next.js 16's replacement for middleware) sets a per-request
Content-Security-Policy with a nonce.

## Photos

1. `POST /api/museums/:id/uploads` checks permission, type and size, reserves a
   `PendingUpload` and returns a short-lived direct upload URL (S3 presigned
   PUT, or a signed `/api/storage/upload` URL for the local driver).
2. The browser uploads the file straight to storage.
3. `POST /api/uploads/:id/complete` re-reads the object, verifies the real
   format by magic bytes, converts HEIC, applies EXIF orientation, converts to
   sRGB, strips all metadata (including GPS), and writes a sanitised original
   plus 2048/1024/480 px WebP derivatives. The incoming object is deleted.
4. Photos are always served through signed URLs that expire after 15 minutes;
   the client refreshes the scene before they expire.

Deleting a photo or museum enqueues its storage keys in `storage_deletions`,
which the maintenance cron retries until the objects are gone.

## Scene and editor

`GET /api/museums/:id/scene` returns everything the 3D view needs: museum,
theme, rooms (from templates plus per-room overrides), walls, frames, photos
with signed URLs, tours, and the viewer's permissions. After any change to the
layout, photos or tours the app notifies the realtime service, which tells
everyone in the museum to refetch the scene.

Frame placement is validated on the server (`src/features/photo-placement`):
inside the wall, clear of doorways and other frames, within size limits.

## Comments and guestbook

`src/services/comment-service.ts` stores comments per photo and a guestbook per
museum. Every member may write (`comment.write`); authors delete their own,
the owner may remove anything (`comment.moderate`, audited). The owner's
`commentsEnabled` privacy switch hides and refuses both while keeping existing
notes. Changes are broadcast with the `comments` scope; the scene carries
counts (`photo.commentCount`, `museum.guestbookCount`), and an open comments
panel or guestbook reloads when its count changes.

## Narrated tours

A tour stop can carry a recorded voice narration (`tour_narrations`, keyed by
tour and frame so it survives the tour's stops being rewritten on save). The
editor records with `MediaRecorder` (WebM/Opus, Ogg or MP4 depending on the
browser, 64 kbit/s, stopped automatically at 3 minutes), lets the author
listen back, then `PUT`s the raw bytes to
`/api/museums/:id/tours/:tourId/narrations/:frameId` (`tour.manage`,
upload rate limit, 5 MB cap enforced while reading). The server identifies
the container by its magic bytes, stores it privately and exposes it in the
scene as a signed URL with its duration. The local storage route answers
byte-range requests (`206`), which Safari needs for media, and the CSP's
`media-src` includes the S3 origin when one is configured.

In the museum, `StopNarration` plays the stop's narration on arrival (a
per-device setting turns autoplay off; if the browser blocks autoplay the play
button remains) and stops when the visitor moves on. In a live tour each
follower's browser plays it locally when the leader changes stop. Narrations
whose stop disappears (tour edited or deleted, frame, photo or room removed)
are swept by `cleanupOrphanNarrations`, which runs after those changes and in
the maintenance cron, and their files go through the deletion queue.

## Export

`GET /api/museums/:id/export` (owner only, `museum.export`, rate-limited)
streams a ZIP built with `fflate`: the sanitised originals under `photos/`,
tour narrations under `narrations/`, `museum.json` (format
`our-museum-export`, version 1) and `index.html`, a self-contained gallery
with no scripts and a CSP that only allows the bundled images and audio.
Files are read one at a time as the download is consumed, and a missing file
is reported in the manifest instead of failing the export.

## 3D runtime

React Three Fiber renders a single canvas (`src/three/scenes/MuseumCanvas.tsx`).

- **Rooms** are generated from template geometry (walls with door openings,
  floors, ceilings, decor) — no downloaded models.
- **Frames** are drawn by an imperative renderer (`frames-renderer.ts`):
  shadows and light washes are instanced; photo textures load lazily with a
  budget (~400 px when far, ~1024 px when near) and are disposed when unused.
- **Controls** (`PlayerController.tsx`): WASD/arrow keys, mouse look with
  pointer lock, touch joystick and drag-to-look, collision against walls and
  other people, glide-to-photo navigation.
- **Avatars** (`src/three/avatars`): a 19-joint procedural rig with procedural
  idle/walk/run/turn/wave clips; remote avatars are interpolated ~140 ms behind
  real time for smooth motion.
- Graphics quality (low/medium/high) adjusts pixel ratio, shadows and texture
  budgets; a performance monitor can step it down automatically.

## Realtime

### Connection

1. The client asks `POST /api/museums/:id/realtime-ticket`. The web app checks
   membership and returns a 60-second, single-use JWT (HS256) carrying the
   user, museum, display name, avatar and the realtime permissions
   (`sharedStart`, `sharedManage`, `voice`, `react`, `tour`).
2. The client opens `REALTIME_PUBLIC_URL` and sends `hello` with the ticket.
   The server verifies signature, audience, expiry, origin and that the ticket
   id (`jti`) has not been used before, then joins the museum room.

Membership changes take effect immediately: the web app calls
`/internal/kick` (authenticated with a short-lived internal JWT) when a member
is removed or a museum is deleted.

### Messages

Client → server: `hello`, `pose`, `gesture`, `viewing`, `shared.start`,
`shared.update`, `shared.join`, `shared.leave`, `shared.end`, `tour.start`,
`tour.step`, `tour.end`, `react`, `voice.state`, `voice.signal`, `ping`.

Server → client: `welcome`, `peer.join`, `peer.leave`, `peer.update`,
`poses` (batched every 80 ms), `gesture`, `shared`, `tour`, `react`,
`voice.signal`, `museum.changed`, `kicked`, `error`, `pong`.

Every message is validated with zod (`src/features/realtime/protocol.ts`) and
checked against the ticket's permissions in `realtime/hub.ts`. Example: when
person A opens a photo in Look Together, the hub verifies A may start shared
viewing, stores the session state for the room, and broadcasts it; person B's
client opens the same photo, follows navigation, zoom and pan, and can leave
at any time.

### Scaling note

Room state lives in the realtime process. One instance comfortably serves a
small deployment; running several requires routing every connection for a
museum to the same instance (or adding a shared pub/sub) — see
[PROJECT_STATUS.md](../PROJECT_STATUS.md).

## Voice

`src/features/voice/voice-manager.ts` builds a WebRTC mesh between people who
turned voice on (the peer with the smaller connection id makes the offer). Audio goes through
an HRTF `PannerNode` positioned at each avatar, so voices come from where
people stand. ICE servers come from `GET /api/realtime/ice` (STUN, plus TURN
with short-lived credentials when configured). Media is encrypted by WebRTC
(DTLS-SRTP) in transit; when traffic is relayed through TURN the relay cannot
read it, but this is **not** end-to-end encryption in the strict sense and the
app does not claim it is.

## Internationalisation

Messages live in `src/i18n/messages/{en,ar}.ts`. The locale comes from the
language cookie (set from the switcher or the account setting), then
`Accept-Language`. Arabic switches the whole
document to `dir="rtl"` and uses Arabic-capable fonts; user content uses
`dir="auto"`.
