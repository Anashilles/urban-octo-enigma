# Project status

_Last updated: 2026-10-20_

Our Museum is a working application: every feature below runs against the
real backend (PostgreSQL, storage, realtime service). Sample data is used only
for the public `/demo` museum, the optional seed and automated tests.

**Not deployed.** Nothing has been published to a public URL. The Docker
stack has been built and run locally (see [Verification](#verification)).

## Build phases

| Phase | Scope | Status |
| --- | --- | --- |
| 1 | Site, accounts, walkable 3D museum, four templates, EN/AR with RTL | Done |
| 2 | Real photo upload (JPEG/PNG/WebP/HEIC), metadata stripping, collections, hanging in the editor and while walking, persistence | Done |
| 3 | Avatars: create, customise, save, animate; first/third person | Done |
| 4 | Invitations, roles, presence, synced movement, Look Together (synced photo, navigation, zoom/pan), go-to-person, reactions | Done |
| 5 | Voice chat (spatial), guided tours (solo and led live), ambient sound, phone layout, admin diagnostics, deployment | Done, with the gaps listed below |

## Verification

What was actually executed (not just written):

| Check | Result |
| --- | --- |
| TypeScript (`tsc --noEmit`), ESLint | Clean |
| Vitest unit + integration (real PostgreSQL) | 124 passed in 16 files (+3 opt-in S3 tests skipped without `S3_TEST_ENDPOINT`) |
| S3 driver against an S3-compatible server (moto, an AWS S3 emulator) | 3 passed (opt-in test, `S3_TEST_ENDPOINT`) |
| Playwright end to end (headless Chromium, software WebGL) | 8 passed (desktop + mobile projects) |
| `npm audit --omit=dev` | 0 vulnerabilities |
| GitHub Actions (`.github/workflows/our-museum.yml`) | Green: lint, typecheck, 124 tests against a PostgreSQL service, production build |
| Production build without any secrets present | Succeeds |
| Docker: build `web`, `realtime`, `tools`; `docker compose up` on a fresh database | Migrations applied, seed ran, health checks green, sign-in, JPEG + HEIC upload, signed thumbnails, 3D museum rendered, WebSocket connected, cron endpoint authorised/refused correctly |

The end-to-end suite covers: automated accessibility checks (EN/AR) and
keyboard navigation of the editor tabs; frame edit conflicts between two
editors; Arabic/RTL landing page; demo museum keyboard
walking, opening and closing a photograph; a full guided tour; the accessible
list when WebGL is unavailable; sign-up → create museum → upload → hang →
find the photos in 3D after a reload; avatar customisation; two browsers —
invite a guest, see each other, Look Together; phone layout with touch
controls.

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
3. **Voice on real networks** — tested only between browser sessions on one
   machine with fake microphones. TURN (coturn REST credentials) is
   implemented but untested; Safari/iOS voice is untested. Voice is a mesh,
   practical for roughly 8 speakers.
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
9. **Large museums** — texture budgets and lazy loading are in place, but no
   load test with hundreds of photos or many simultaneous visitors was run.
10. **Monitoring and backups** — JSON logs, health endpoints and the admin page
    only; no error-tracking service, alerting or automated backups.
11. **Content features not built** — narrated (audio) tours, video uploads,
    comments/guestbook, importing from photo services, custom 3D model
    upload for avatars or decor, and museum export/download.
12. **E2E in CI** — GitHub Actions runs lint, typecheck, unit + integration
    tests and a secret-free build on every push; the Playwright suite (3D in
    software WebGL, ~3 minutes) still runs only locally.

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
