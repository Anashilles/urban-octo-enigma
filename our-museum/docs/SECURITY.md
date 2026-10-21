# Security

Our Museum stores people's private photos, so the default answer to "can
this person see or change this?" is **no** unless the server says yes.

## What we protect against

| Threat | Mitigation |
| --- | --- |
| Someone outside a museum seeing its photos | Membership checked on every API call; photos only reachable through signed URLs that expire in 15 minutes; private bucket; no public listing; `robots.txt` and `noindex` on invitation pages |
| A visitor editing or deleting things | One server-side permissions table (`src/lib/permissions`) checked in every service and in the realtime hub; the UI only hides controls |
| Leaked or guessed invitation links | 256-bit random tokens, stored as SHA-256 hashes, shown once; expiry, use limits, revocation, optional email binding; redemption is rate-limited and row-locked |
| Location leaks from photo metadata | Every upload is decoded and re-encoded; EXIF, XMP, IPTC and GPS are dropped (only orientation is applied, then removed) |
| Malicious files | Type checked by magic bytes, not extension; size limit enforced before and after upload; pixel limit (100 MP) and decode errors rejected; only re-encoded images are ever served |
| Cross-site request forgery | Mutating API calls require a same-origin `Origin` / `Sec-Fetch-Site`; cookies are `HttpOnly`, `SameSite=Lax`, `Secure` in production |
| Cross-site scripting | React escaping, no `dangerouslySetInnerHTML` for user content, a per-request nonce CSP with `strict-dynamic`, `object-src 'none'`, `frame-ancestors 'none'` |
| Realtime impersonation or eavesdropping | Connections need a single-use, 60-second ticket minted after a membership check; origin allow-list; every message validated and permission-checked; removed members are disconnected immediately |
| Abuse and brute force | Rate limits on sign-in, sign-up, password reset, API calls, uploads, invitations, comments, tickets and realtime messages |
| Unwanted comments | Comments and guestbook entries are plain text rendered as text (never HTML); authors delete their own, owners can remove any (audited), and owners can turn both off |
| Secrets in the client | Only `NEXT_PUBLIC_ENABLE_TEST_HOOKS` (a boolean, off in production) is exposed to the browser; storage, database, TURN and auth secrets stay on the server |

## Authentication

[Better Auth](https://better-auth.com) with email and password (8–128
characters, scrypt hashing), optional email verification
(`AUTH_REQUIRE_EMAIL_VERIFICATION`), password reset that revokes all
sessions, 30-day sessions refreshed daily, and account deletion that removes
owned museums and queues their files for deletion.

Invitation-only guests (when the owner allows it, visitor role only) get an
anonymous account so the server can still attribute and authorise them; they
can upgrade to a full account and keep their avatar.

Admin pages (`/admin`) and APIs (`/api/admin/*`) are limited to verified
users listed in `ADMIN_EMAILS` and answer `404` to everyone else.

## Authorisation

Roles per museum: **Owner** (everything, including privacy, members,
invitations and deletion), **Editor** (photos, collections, hanging, rooms
layout, tours, appearance), **Visitor** (view, react, voice, and Look Together
unless the owner turns that off). The full matrix is the `TABLE` in
`src/lib/permissions/index.ts` and is unit-tested.

Every route resolves the membership from the session — never from a request
parameter — before calling a service. Resources are always loaded scoped to
the museum (`where: { id, museumId }`) so ids from another museum cannot be
substituted. Integration tests cover visitor/editor/outsider denial for
museums, rooms, photos, frames, invitations, tours and reactions, and
cross-museum id substitution for frames.

## Photos and storage

- Uploads go directly to storage with a short-lived, single-object URL
  (presigned S3 `PUT`, or an HMAC-signed local URL) bound to the declared type
  and size.
- Completion re-reads the object on the server and re-encodes it (see
  [ARCHITECTURE.md](ARCHITECTURE.md#photos)). The raw upload is deleted.
- Served URLs are signed (S3 presigned `GET` or HMAC for local storage), expire
  after 15 minutes and are bucketed so browsers can cache within that window.
- The bucket must be private. Never enable public access or a public CDN on
  it.
- Deleted photos and museums are removed from storage by a retried queue.

## Realtime and voice

- Tickets are HS256 JWTs signed with `REALTIME_TICKET_SECRET` (audience,
  issuer, 60 s expiry, unique `jti` remembered until expiry).
- The web app talks to the realtime service with separate short-lived JWTs
  (different audience), so a browser ticket cannot call internal endpoints.
- The realtime service never sees the database or auth secrets.
- Voice uses WebRTC, which encrypts media in transit (DTLS-SRTP). Media is
  peer to peer or relayed through your TURN server. This is **not**
  end-to-end encryption as a product guarantee, and the app does not claim it.
  The microphone is only requested after an explicit click, and
  `Permissions-Policy` limits it to this origin.
- `VOICE_RELAY_ONLY=true` routes all voice through TURN so participants never
  see each other's IP addresses (fails closed without TURN).
- TURN credentials are minted per user with a short lifetime from
  `TURN_SHARED_SECRET` (coturn REST API); the secret never reaches the client.

## Rate limiting

| Scope | Rule | Where |
| --- | --- | --- |
| Sign-in, sign-up, anonymous sign-in | 10 per minute per IP | Better Auth (stored in the database, shared by all instances) |
| Password reset, verification email | 5 per 5 minutes | Better Auth |
| API reads | burst 120, 4/s | `src/lib/rate-limit.ts` |
| API mutations | burst 60, 2/s | 〃 |
| Uploads | burst 30, 1 per 2 s | 〃 |
| Invitation creation | burst 20, 1 per 30 s | 〃 |
| Invitation redemption | burst 10, 1 per 20 s | 〃 |
| Realtime tickets | burst 20, 1 per 2 s | 〃 |
| Emails sent by the app | burst 5, 1 per minute | 〃 |
| Comments and guestbook entries | burst 20, 1 per 6 s | 〃 |
| Realtime connections | burst 20 per IP, 1 per 2 s | `realtime/server.ts` |
| Realtime messages | poses 25/s, voice signalling 50/s, other 8/s per connection; repeated abuse closes the connection | 〃 |

The API and realtime limiters are **in memory, per process**. That is correct
for a single instance. With several web instances, each enforces its own
budget (limits are multiplied by the instance count); put a shared store such
as Redis behind the `TokenBucketLimiter` interface before scaling out. Set
`REALTIME_TRUST_PROXY=true` only behind your own reverse proxy, otherwise
clients could spoof `X-Forwarded-For`.

`AUTH_RATE_LIMIT=off` exists only for automated test runs.

## Headers

`Content-Security-Policy` (per request, with nonce), `Strict-Transport-Security`
(production), `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`,
`Referrer-Policy: strict-origin-when-cross-origin` (`no-referrer` on invitation
pages), `Cross-Origin-Opener-Policy: same-origin`, and a restrictive
`Permissions-Policy`.

## Logging and privacy

Logs are structured JSON. Email addresses are masked, tokens and passwords are
never logged, and photo contents are never sent to third parties. There is no
analytics or tracking script. The privacy page (`/privacy`) explains what is
stored.

## Reporting a vulnerability

Please report security issues privately to the operator of your deployment
(`CONTACT_EMAIL`), not in a public issue.

## Known gaps

See [PROJECT_STATUS.md](../PROJECT_STATUS.md#security-follow-ups).
