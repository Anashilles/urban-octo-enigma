# Deployment

Our Museum needs four things in production:

1. **PostgreSQL 16+**
2. **The web app** (Next.js, Node.js 20.19+)
3. **The realtime service** (`realtime/server.ts`, a long-lived WebSocket server)
4. **Photo storage** — a private S3-compatible bucket, or a persistent disk
   when everything runs on one server

plus HTTPS in front of both public services (browsers require a secure origin
for microphones), and optionally a TURN server for voice chat behind strict
firewalls.

> Status: the Docker stack below was built and run end to end in the
> development environment (fresh database, migrations, seed, sign-in, JPEG and
> HEIC uploads, realtime connection). No public deployment has been made or
> verified, and the Vercel/managed-hosting path is documented but untested.

## Option A — one server with Docker Compose

Good for a family or small group on a single VPS.

```bash
git clone <repository-url> museum && cd museum/our-museum
cp .env.example .env
# Fill in at least:
#   POSTGRES_PASSWORD, BETTER_AUTH_SECRET, REALTIME_TICKET_SECRET   (openssl rand -base64 48)
#   APP_URL=https://museum.example.com
#   REALTIME_PUBLIC_URL=wss://realtime.museum.example.com
docker compose up -d --build
docker compose logs -f web
```

Services: `db` (PostgreSQL, volume `db`), `migrate` (applies migrations then
exits; `web` waits for it), `realtime` (port 4001), `web` (port 3000, photos in
volume `storage`). Only the ticket secret is given to `realtime`.

Optional demo data (generated artwork only, no real photographs):

```bash
SEED_EMAIL=you@example.com SEED_PASSWORD='a long password' docker compose run --rm migrate npm run db:seed
```

Prisma prints an OpenSSL detection warning inside the `tools` image; migrations
and the seed were verified to work regardless.

### HTTPS with Caddy

```caddyfile
museum.example.com {
  reverse_proxy localhost:3000
}
realtime.museum.example.com {
  reverse_proxy localhost:4001
}
```

Caddy obtains certificates automatically and proxies WebSockets. Set
`REALTIME_TRUST_PROXY=true` for the realtime service so per-IP limits use the
real client address.

Browsers connect to `${REALTIME_PUBLIC_URL}/ws`, and the service answers `/ws`
and `/health` at its root. To use a single hostname, mount it under a prefix
that the proxy strips:

```caddyfile
museum.example.com {
  handle_path /realtime/* {
    reverse_proxy localhost:4001
  }
  reverse_proxy localhost:3000
}
```

with `REALTIME_PUBLIC_URL=wss://museum.example.com/realtime`.

### Upgrades

```bash
git pull && docker compose up -d --build   # migrate runs before web starts
```

### Backups

Back up the database (`docker compose exec -T db pg_dump -U museum our_museum > backup.sql`)
and the `storage` volume together.

## Option B — managed hosting

| Piece | Examples | Notes |
| --- | --- | --- |
| Web app | Vercel, Render, Fly.io, Railway, any Node host | Build: `npm run build`; start: `npm start` (or the `web` Docker target) |
| Realtime | Fly.io, Render, Railway, a small VM | Must support long-lived WebSockets — **not** serverless functions. Run `npm run realtime:build` then `node dist/realtime/server.mjs`, or the `realtime` Docker target |
| Database | Neon, Supabase, RDS, Cloud SQL | Connect as the table owner (see [DATABASE.md](DATABASE.md#row-level-security)); run `npm run db:migrate` on each release |
| Storage | Cloudflare R2, S3, Supabase Storage (S3 API), MinIO | `STORAGE_DRIVER=s3`; bucket private; CORS below |
| Email | Any SMTP provider | `EMAIL_DRIVER=smtp`, `SMTP_URL`, `EMAIL_FROM` |

On Vercel, `vercel.json` schedules `/api/cron/cleanup` daily; Vercel sends
`Authorization: Bearer $CRON_SECRET` automatically when `CRON_SECRET` is set.
Elsewhere, call it from any scheduler:

```bash
curl -fsS -X POST -H "Authorization: Bearer $CRON_SECRET" https://museum.example.com/api/cron/cleanup
```

Serverless hosts have no persistent disk: use `STORAGE_DRIVER=s3` there.

### Bucket CORS (direct uploads)

Browsers upload straight to the bucket with presigned `PUT` URLs, so the bucket
must allow your app origin:

```json
[
  {
    "AllowedOrigins": ["https://museum.example.com"],
    "AllowedMethods": ["PUT", "GET"],
    "AllowedHeaders": ["content-type"],
    "MaxAgeSeconds": 3600
  }
]
```

If the endpoint the server uses differs from the one browsers reach (e.g. an
internal MinIO hostname), set `S3_ENDPOINT` to the internal one and
`S3_PUBLIC_ENDPOINT` to the public one; the CSP allows the public origin
automatically.

The S3 driver has an opt-in integration test for any S3-compatible server:

```bash
S3_TEST_ENDPOINT=http://127.0.0.1:9000 npx vitest run tests/integration/s3-storage.test.ts
```

So far it has run against moto (an AWS S3 emulator). A full browser upload
against a cloud bucket (including CORS) has not been verified yet.

## Environment variables

All variables are listed with comments in [`.env.example`](../.env.example).
Empty values count as unset. Required in production:

| Variable | Used by | Notes |
| --- | --- | --- |
| `APP_URL` | web, realtime | Public origin, `https://…`. Enables `upgrade-insecure-requests` when HTTPS |
| `DATABASE_URL` | web, migrations | PostgreSQL connection string (owner role) |
| `BETTER_AUTH_SECRET` | web | ≥ 32 random characters. Rotating it signs everyone out |
| `REALTIME_TICKET_SECRET` | web, realtime | ≥ 32 characters, identical in both services |
| `REALTIME_PUBLIC_URL` | web | `wss://…` URL browsers connect to (read at runtime, not baked into the build) |
| `REALTIME_INTERNAL_URL` | web | How the web app reaches the realtime service (`http://realtime:4001` in compose) |
| `CRON_SECRET` | web | ≥ 16 characters, for `/api/cron/cleanup` |

Commonly set:

| Variable | Default | Notes |
| --- | --- | --- |
| `STORAGE_DRIVER` | `local` | `s3` needs `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` (+ `S3_ENDPOINT`, `S3_REGION`, `S3_FORCE_PATH_STYLE` for non-AWS) |
| `STORAGE_LOCAL_DIR` | `./.data/storage` | `/data/storage` in the Docker image; must be persistent |
| `STORAGE_SIGNING_SECRET` | derived | Separate secret for local-storage URL signatures |
| `UPLOAD_MAX_BYTES` | 15 MB | Per photo |
| `EMAIL_DRIVER` / `SMTP_URL` / `EMAIL_FROM` | `console` | Without SMTP, verification/reset/invitation emails are only logged |
| `AUTH_REQUIRE_EMAIL_VERIFICATION` | `false` | Turn on once SMTP works |
| `ADMIN_EMAILS` | — | Comma-separated; admins also need a verified email |
| `STUN_URLS` / `TURN_URLS` / `TURN_SHARED_SECRET` | — | Voice connectivity, see below |
| `REALTIME_ALLOWED_ORIGINS` | `APP_URL` | Extra origins allowed to open WebSockets |
| `REALTIME_TRUST_PROXY` | `false` | `true` only behind your reverse proxy |
| `REALTIME_MAX_PER_ROOM` / `REALTIME_MAX_PER_USER` | 32 / 3 | Connection caps |
| `DATABASE_POOL_MAX` | 10 | Per web process |
| `LOG_LEVEL` | `info` | |
| `CONTACT_EMAIL` | — | Shown on the privacy page and footer |

Never set in production: `ENABLE_DEV_OUTBOX` (the app refuses to start),
`NEXT_PUBLIC_ENABLE_TEST_HOOKS` (it is compiled into the client bundle, so
production builds must not have it), `AUTH_RATE_LIMIT=off`.

The build itself needs no secrets: `next build` uses inert placeholders for
required values during the build phase only. It does need network access to
download the Google Fonts it self-hosts.

## Voice chat and TURN

Voice works with STUN alone when people are on ordinary home networks. Behind
corporate firewalls, carrier-grade NAT or some mobile networks, a TURN relay
is needed. With [coturn](https://github.com/coturn/coturn):

```ini
# /etc/turnserver.conf
listening-port=3478
tls-listening-port=5349
realm=museum.example.com
use-auth-secret
static-auth-secret=<same value as TURN_SHARED_SECRET>
cert=/etc/letsencrypt/live/turn.museum.example.com/fullchain.pem
pkey=/etc/letsencrypt/live/turn.museum.example.com/privkey.pem
no-cli
no-multicast-peers
denied-peer-ip=10.0.0.0-10.255.255.255
denied-peer-ip=172.16.0.0-172.31.255.255
denied-peer-ip=192.168.0.0-192.168.255.255
```

```bash
STUN_URLS=stun:turn.museum.example.com:3478
TURN_URLS=turn:turn.museum.example.com:3478?transport=udp,turns:turn.museum.example.com:5349?transport=tcp
TURN_SHARED_SECRET=<random>
```

The app mints per-user credentials valid for one hour; the shared secret
never reaches browsers. TURN support is implemented but has **not** been tested
against a real coturn server.

Voice is a mesh: each person sends audio to every other person with voice on.
That is fine for small groups (the realtime service caps rooms at 32 people;
voice is practical up to roughly 8 speakers).

## Health and monitoring

- `GET /api/health` — public liveness (`200` or `503` when the database is down)
- `GET /health` on the realtime service — liveness and room/connection counts
- `/admin` — database, storage, realtime, email and ICE configuration checks,
  counts, rate-limit rejections and maintenance actions (admins only)
- Logs are JSON lines on stdout; ship them to your log platform. No error
  tracking service is integrated.

## Scaling notes

- Web app: stateless apart from the in-memory API rate limiter (see
  [SECURITY.md](SECURITY.md#rate-limiting)); several instances work, with
  per-instance limits.
- Realtime: keep **one** instance, or pin each museum to one instance (e.g.
  consistent hashing on the museum id at the load balancer). Rooms are not
  shared between instances.
