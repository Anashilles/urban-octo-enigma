# Our Museum

**A 3D museum hung with your photos, to walk through together from anywhere.**

Our Museum turns a private photo collection into a gallery you can walk
through in the browser — alone, or with the people in the photos. Upload your
own pictures, hang them on the walls, invite family or friends, and explore
side by side as avatars: see where everyone is, open the same photo together,
take a guided tour, react, and talk with spatial voice chat.

English and Arabic (full right-to-left layout) are built in.

## Features

| Area | What works |
| --- | --- |
| Museums | Four architectural templates, multiple rooms, theme (wall colour, floor, lighting, frame style), privacy switches |
| Photos | Direct uploads (JPEG, PNG, WebP, HEIC), metadata and GPS stripped, 3 web derivatives, collections, favourites, timeline by date taken |
| Hanging | Wall editor with snapping and overlap/doorway checks, and **Place on Wall** while walking through the museum |
| Exploring | First/third-person walking, keyboard, mouse and touch controls, photo viewer with zoom/pan, guided tours, generative ambient sound |
| Avatars | Procedural rigged avatars (body, skin, hair, clothes, accessories) with idle/walk/run/wave animations |
| Together | Invitations (hashed single-use or multi-use links, email optional), presence, smooth movement, name tags, **Look Together** (shared photo viewing), live tours, reactions, go-to-person |
| Voice | Optional WebRTC voice chat with spatial audio, mute, speaking indicators and listen-only fallback |
| Roles | Owner / Editor / Visitor, enforced on the server for every API call and realtime message |
| Operations | Health endpoint, admin diagnostics, maintenance cron, Docker images and compose stack |

What is *not* finished or not verified is listed honestly in
[PROJECT_STATUS.md](PROJECT_STATUS.md).

## Quick start (local development)

Requirements: Node.js ≥ 20.19, PostgreSQL 16+.

```bash
npm install
cp .env.example .env               # set DATABASE_URL and BETTER_AUTH_SECRET at least
npm run db:migrate                 # apply migrations
npm run db:seed                    # optional: demo account + sample museum (generated art only)
npm run dev:all                    # web app on :3000 + realtime service on :4001
```

Open <http://localhost:3000>. The `/demo` museum works without an account.

`npm run dev` starts only the web app; exploring together, presence and voice
need the realtime service (`npm run realtime`).

## Scripts

| Script | Purpose |
| --- | --- |
| `dev`, `dev:all` | Web app (Turbopack) / web app + realtime with reload |
| `build`, `start` | Production build and server |
| `realtime`, `realtime:build`, `realtime:start` | Realtime service: run from source / bundle to `dist/realtime/server.mjs` / run the bundle |
| `lint`, `typecheck` | ESLint, TypeScript |
| `test`, `test:unit`, `test:integration` | Vitest (integration tests use a separate `our_museum_test` database, see `tests/helpers/test-env.ts`) |
| `test:e2e` | Playwright (the dev server must run with `NEXT_PUBLIC_ENABLE_TEST_HOOKS=true`, `AUTH_RATE_LIMIT=off`, `AUTH_REQUIRE_EMAIL_VERIFICATION=false`) |
| `db:migrate`, `db:migrate:dev`, `db:seed`, `db:studio` | Prisma |

## Documentation

- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — components, data flow, realtime protocol, 3D runtime
- [docs/DATABASE.md](docs/DATABASE.md) — schema, migrations, row-level security
- [docs/SECURITY.md](docs/SECURITY.md) — threat model, authorisation, uploads, rate limiting
- [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) — environment variables, Docker, hosting options, TURN
- [docs/ASSETS_AND_LICENSES.md](docs/ASSETS_AND_LICENSES.md) — where every visual and sound comes from
- [PROJECT_STATUS.md](PROJECT_STATUS.md) — what is done, what was tested, what is missing

## Tech stack

Next.js 16 (App Router) · React 19 · TypeScript · Tailwind CSS 4 · Radix UI ·
React Three Fiber / three.js · Zustand · PostgreSQL + Prisma 7 · Better Auth ·
`ws` realtime service · WebRTC · sharp · Vitest · Playwright.
