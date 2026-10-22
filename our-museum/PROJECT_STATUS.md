# Project status

_Last updated: 2026-10-22_

Our Museum is a working application: every feature below runs against the
real backend (PostgreSQL, storage, realtime service). Sample data is used only
for the public `/demo` museum, the optional seed and automated tests.

**Not deployed.** The app has not been published to a public URL. The Docker
stack has been built and run locally (see [Verification](#verification)).
A static copy of the public demo museum (3D walk, sample art, adding and
hanging your own photos kept only in the browser) was published as a private
claude.ai page for previewing; it has no server, accounts or storage and is
not a deployment of the app.

## Build phases

| Phase | Scope | Status |
| --- | --- | --- |
| 1 | Site, accounts, walkable 3D museum, four templates, EN/AR with RTL | Done |
| 2 | Real photo upload (JPEG/PNG/WebP/HEIC), metadata stripping, collections, hanging in the editor and while walking, persistence | Done |
| 3 | Avatars: create, customise, save, animate; first/third person | Done |
| 4 | Invitations, roles, presence, synced movement, Look Together (synced photo, navigation, zoom/pan), go-to-person, reactions | Done |
| 5 | Voice chat (spatial), guided tours (solo and led live), ambient sound, phone layout, admin diagnostics, deployment | Done, with the gaps listed below |
| + | Comments on photographs and a museum guestbook (live, moderated, switchable) | Done |
| + | Museum export: ZIP with originals, manifest and an offline gallery page | Done |
| + | Narrated tours: a voice note recorded in the browser for each stop, played on arrival (solo and live tours), included in exports | Done (recording verified in Chromium only) |
| + | Inside the museum: add a photo from your device and hang it straight away; change the picture in a hung frame (from the library or the device) | Done |

## Verification

What was actually executed (not just written):

| Check | Result |
| --- | --- |
| TypeScript (`tsc --noEmit`), ESLint | Clean |
| Vitest unit + integration (real PostgreSQL) | 153 passed in 20 files (+3 opt-in S3 tests skipped without `S3_TEST_ENDPOINT`) |
| S3 driver against an S3-compatible server (moto, an AWS S3 emulator) | 3 passed (opt-in test, `S3_TEST_ENDPOINT`) |
| Playwright end to end (headless Chromium, software WebGL) | 16 passed, 1 opt-in skipped (TURN relay) — desktop + mobile projects |
| `npm audit --omit=dev` | 0 vulnerabilities |
| GitHub Actions (`.github/workflows/our-museum.yml`) | Green: lint, typecheck, unit + integration tests against a PostgreSQL service, production build, Playwright suite |
| Production build without any secrets present | Succeeds |
| Docker: build `web`, `realtime`, `tools`; `docker compose up` on a fresh database | Migrations applied, seed ran, health checks green, sign-in, JPEG + HEIC upload, signed thumbnails, 3D museum rendered, WebSocket connected, cron endpoint authorised/refused correctly |

The end-to-end suite covers: automated accessibility checks (EN/AR) and
keyboard navigation of the editor tabs; frame edit conflicts between two
editors; Arabic/RTL landing page; demo museum keyboard
walking, opening and closing a photograph; a full guided tour; the accessible
list when WebGL is unavailable; sign-up → create museum → upload → hang →
find the photos in 3D after a reload; avatar customisation; two browsers —
invite a guest, see each other, Look Together; comments and the guestbook
live between two browsers; downloading an export and opening it offline;
recording a tour narration with Chromium's fake microphone and hearing it
play on the tour; adding a photo from the device inside the museum, hanging
it, and changing a frame's picture from the library and from the device;
phone layout with touch controls.

Checked by hand in browsers during development: placing photos while
walking (overlap and doorway refusal), avatar walk/run/wave and third person,
go-to-person, ending Look Together for everyone, floating reactions, voice
between two browser sessions (connect, mute, leave, speaking indicator) using
Chromium's fake microphone, live tours with followers, the phone HUD in both
languages, and the admin dashboard.

## Not done or not verified

Listed plainly so nobody mistakes them for finished:

1. **Public deployment** — not done. Managed-hosting instructions (Vercel +
   separate realtime host) are written but untested.
2. **Email delivery** — the SMTP path is tested against a local SMTP server
   with authentication (English and Arabic messages, a full password reset by
   email, header-injection attempts, a bounced invitation). Not tried: TLS
   (`smtps://` / STARTTLS) and real providers' deliverability (SPF/DKIM).
3. **Voice on real networks** — tested between browser sessions on one
   machine with fake microphones, both direct and relay-only through a local
   TURN server that checks the app's coturn-style shared-secret credentials.
   Not tested: coturn itself, real NATs and mobile networks, Safari/iOS.
   Voice is a mesh, practical for roughly 8 speakers.
4. **Cloud object storage** — the S3 driver passed against an S3-compatible
   mock; AWS S3/R2 and browser uploads through bucket CORS have not been tried.
5. **Scaling out** — one realtime instance only (rooms are in memory); API and
   realtime rate limiters are per process. See
   [DEPLOYMENT.md](docs/DEPLOYMENT.md#scaling-notes).
6. **Concurrent editing** — edits to the same frame are version-checked (a
   stale edit is refused and the editor reloads), but the editor does not
   live-update while someone else edits, and two people hanging *different*
   frames into the same free spot at the same instant can still overlap.
7. **Real devices** — phones were tested with Playwright's mobile emulation,
   not on physical iOS/Android hardware. GPU performance on low-end phones is
   unknown.
8. **Accessibility** — an automated axe-core suite (WCAG 2.1 A/AA plus best
   practices) passes with zero violations on every main page, all editor
   tabs and the museum's panels and photo viewer, in English and Arabic.
   Automated rules catch only part of the picture: no screen-reader session
   (VoiceOver/NVDA/TalkBack) or formal WCAG conformance review has been done.
9. **Scale** — the realtime service was load-tested up to 1,000 moving
   visitors on one instance (see DEPLOYMENT.md#capacity). Not tested: browser
   performance with hundreds of photos in one museum (texture budgets and lazy
   loading exist), and load on the web app and database.
10. **Monitoring and backups** — JSON logs, health endpoints and the admin page
    only; no error-tracking service, alerting or automated backups.
11. **Content features not built** — video uploads, importing from photo
    services or from an export, and custom 3D model upload for avatars or
    decor. Narrations are recorded in the browser only (no uploading an
    existing audio file, no trimming or transcripts).
12. **Narration in other browsers** — recording and playback were verified
    in Chromium with its fake microphone. Safari records MP4 and Firefox Ogg
    or WebM; the server accepts all three, but neither browser has been
    tried.
13. **CI coverage** — GitHub Actions runs lint, typecheck, unit +
    integration tests, a secret-free build and the Playwright suite on every
    push. The opt-in checks (S3, TURN relay) need external services and run
    only when configured.

## Security follow-ups

- Shared rate-limit store (e.g. Redis) before running several web or realtime
  instances.
- Two-factor authentication and passkeys (Better Auth supports both; not
  enabled).
- `style-src 'unsafe-inline'` remains in the CSP (inline style attributes
  from React and the 3D overlays).
- Voice is encrypted in transit by WebRTC but is **not** end-to-end encrypted
  as a product guarantee.
- Administrators must have a verified email; with
  `AUTH_REQUIRE_EMAIL_VERIFICATION=false` ordinary users can still use the app
  unverified.

## Where things are

See [README.md](README.md) for setup and scripts, and `docs/` for
architecture, database, security, deployment and asset licences.
