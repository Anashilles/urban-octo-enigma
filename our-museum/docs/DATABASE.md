# Database

PostgreSQL 16+, accessed through Prisma 7 with the `pg` driver adapter
(`src/lib/database/prisma.ts`). The schema is `prisma/schema.prisma`;
migrations are in `prisma/migrations`.

## Commands

```bash
npm run db:migrate        # apply pending migrations (production: prisma migrate deploy)
npm run db:migrate:dev    # create a migration from schema changes (development)
npm run db:seed           # demo account + sample museum (idempotent per email)
npm run db:studio         # browse data
```

In Docker, migrations run as the one-off `migrate` service (see
[DEPLOYMENT.md](DEPLOYMENT.md)).

## Tables

| Area | Tables | Notes |
| --- | --- | --- |
| Auth (Better Auth) | `users`, `sessions`, `accounts`, `verifications`, `rate_limits` | Passwords are hashed by Better Auth (scrypt). Anonymous guest users have `isAnonymous = true`. |
| Museums | `museums`, `museum_rooms`, `museum_walls` | `theme` and `privacy` are validated JSON. Rooms come from a template; walls hold per-wall overrides. `layoutVersion` increments on every layout change (rooms, frames, theme). |
| Access | `museum_memberships`, `museum_invitations`, `museum_visits` | One membership per (museum, user) with role `OWNER`/`EDITOR`/`VISITOR`. Invitations store only a SHA-256 of the token, plus role, expiry, use limit and revocation. |
| Photos | `photos`, `pending_uploads`, `storage_deletions` | Photos keep storage keys for the sanitised original and three derivatives. Pending uploads expire; deletions are retried by the cron. |
| Organising | `photo_collections`, `collection_photos`, `photo_favorites`, `photo_reactions` | Favourites are per user; reactions are unique per (photo, user, emoji). |
| Hanging | `photo_frames` | Position on a wall (u, v in metres), size, tilt, frame style, mat and plaque options, edit `version`. |
| People | `avatar_profiles` | One validated avatar config per user. |
| Notes | `photo_comments`, `guestbook_entries` | Plain text (control characters stripped, ≤ 1000 / 500 characters). Removed with the photo, the museum or the author's account. |
| Tours | `guided_tours`, `tour_stops` | Ordered stops referencing frames, with notes. |
| Audit | `museum_events` | Who did what: invitations, membership changes, failed uploads, frame, room, tour and photo changes, deletions. |

Deleting a museum cascades to everything that belongs to it; its stored files
are queued in `storage_deletions` first. Deleting a user removes the museums
they own (same path) and their memberships; photos they uploaded to *other*
people's museums stay (`uploadedById` becomes null).

## Row Level Security

Migration `20261019230327_enable_row_level_security` enables RLS on **every**
table with a restrictive deny-all policy for all roles.

- The application connects as the table owner, which bypasses RLS (no
  `FORCE ROW LEVEL SECURITY`). All authorisation happens in the service layer.
- Any other role — for example Supabase's `anon` / `authenticated` roles behind
  its auto-generated REST API, or a read-only analytics role added later —
  sees no rows. Private photos and memberships cannot leak through a side
  channel that skips the application's checks.

If you deploy on Supabase, connect the app with the database owner role
(`postgres`), never with the `anon` key, and keep the Data API disabled or
restricted.

When you add a table, add the same two statements in its migration:

```sql
ALTER TABLE "new_table" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "new_table_application_only" ON "new_table" AS RESTRICTIVE FOR ALL TO PUBLIC USING (false) WITH CHECK (false);
```

## Concurrency

- Invitation redemption locks the invitation row (`SELECT … FOR UPDATE`) so
  use limits hold under concurrent requests.
- Frames carry a `version` that increments on every edit. The editor sends
  the version it edited (`expectedVersion`); the update is conditional on it
  (`UPDATE … WHERE id = $1 AND version = $2`), so of two simultaneous edits
  exactly one wins and the other gets `409 CONFLICT` with the current frame.
  The editor then shows the other person's version. Its own quick successive
  edits are queued per frame so they never conflict with each other.
- Two editors placing *different* frames into the same free spot at the same
  moment is not prevented (each validates against the wall as it was).

## Backups

Not automated by this project. Use your provider's point-in-time recovery or
scheduled `pg_dump`, and back up the photo storage (bucket or volume) on the
same schedule — the database only stores keys.
