-- Row Level Security — defence in depth.
--
-- The application connects as the owner of these tables. Table owners bypass RLS
-- (we deliberately do NOT use FORCE ROW LEVEL SECURITY), and every request is
-- authorised in the service layer (src/lib/permissions + src/services).
--
-- Every other database role — for example Supabase's `anon` and `authenticated`
-- roles used by its auto-generated Data API, or any read-only role added later —
-- is denied all row access by an explicit RESTRICTIVE policy. Private museums,
-- photos and memberships therefore cannot leak through a side channel that
-- bypasses the application's authorisation checks.

ALTER TABLE "users" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users_application_only" ON "users" AS RESTRICTIVE FOR ALL TO PUBLIC USING (false) WITH CHECK (false);

ALTER TABLE "sessions" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sessions_application_only" ON "sessions" AS RESTRICTIVE FOR ALL TO PUBLIC USING (false) WITH CHECK (false);

ALTER TABLE "accounts" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "accounts_application_only" ON "accounts" AS RESTRICTIVE FOR ALL TO PUBLIC USING (false) WITH CHECK (false);

ALTER TABLE "verifications" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "verifications_application_only" ON "verifications" AS RESTRICTIVE FOR ALL TO PUBLIC USING (false) WITH CHECK (false);

ALTER TABLE "rate_limits" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "rate_limits_application_only" ON "rate_limits" AS RESTRICTIVE FOR ALL TO PUBLIC USING (false) WITH CHECK (false);

ALTER TABLE "museums" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "museums_application_only" ON "museums" AS RESTRICTIVE FOR ALL TO PUBLIC USING (false) WITH CHECK (false);

ALTER TABLE "museum_memberships" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "museum_memberships_application_only" ON "museum_memberships" AS RESTRICTIVE FOR ALL TO PUBLIC USING (false) WITH CHECK (false);

ALTER TABLE "museum_invitations" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "museum_invitations_application_only" ON "museum_invitations" AS RESTRICTIVE FOR ALL TO PUBLIC USING (false) WITH CHECK (false);

ALTER TABLE "museum_visits" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "museum_visits_application_only" ON "museum_visits" AS RESTRICTIVE FOR ALL TO PUBLIC USING (false) WITH CHECK (false);

ALTER TABLE "photos" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "photos_application_only" ON "photos" AS RESTRICTIVE FOR ALL TO PUBLIC USING (false) WITH CHECK (false);

ALTER TABLE "pending_uploads" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "pending_uploads_application_only" ON "pending_uploads" AS RESTRICTIVE FOR ALL TO PUBLIC USING (false) WITH CHECK (false);

ALTER TABLE "storage_deletions" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "storage_deletions_application_only" ON "storage_deletions" AS RESTRICTIVE FOR ALL TO PUBLIC USING (false) WITH CHECK (false);

ALTER TABLE "photo_collections" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "photo_collections_application_only" ON "photo_collections" AS RESTRICTIVE FOR ALL TO PUBLIC USING (false) WITH CHECK (false);

ALTER TABLE "collection_photos" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "collection_photos_application_only" ON "collection_photos" AS RESTRICTIVE FOR ALL TO PUBLIC USING (false) WITH CHECK (false);

ALTER TABLE "photo_favorites" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "photo_favorites_application_only" ON "photo_favorites" AS RESTRICTIVE FOR ALL TO PUBLIC USING (false) WITH CHECK (false);

ALTER TABLE "photo_reactions" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "photo_reactions_application_only" ON "photo_reactions" AS RESTRICTIVE FOR ALL TO PUBLIC USING (false) WITH CHECK (false);

ALTER TABLE "museum_rooms" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "museum_rooms_application_only" ON "museum_rooms" AS RESTRICTIVE FOR ALL TO PUBLIC USING (false) WITH CHECK (false);

ALTER TABLE "museum_walls" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "museum_walls_application_only" ON "museum_walls" AS RESTRICTIVE FOR ALL TO PUBLIC USING (false) WITH CHECK (false);

ALTER TABLE "photo_frames" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "photo_frames_application_only" ON "photo_frames" AS RESTRICTIVE FOR ALL TO PUBLIC USING (false) WITH CHECK (false);

ALTER TABLE "avatar_profiles" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "avatar_profiles_application_only" ON "avatar_profiles" AS RESTRICTIVE FOR ALL TO PUBLIC USING (false) WITH CHECK (false);

ALTER TABLE "guided_tours" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "guided_tours_application_only" ON "guided_tours" AS RESTRICTIVE FOR ALL TO PUBLIC USING (false) WITH CHECK (false);

ALTER TABLE "tour_stops" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tour_stops_application_only" ON "tour_stops" AS RESTRICTIVE FOR ALL TO PUBLIC USING (false) WITH CHECK (false);

ALTER TABLE "museum_events" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "museum_events_application_only" ON "museum_events" AS RESTRICTIVE FOR ALL TO PUBLIC USING (false) WITH CHECK (false);

-- Supabase-specific hardening: remove table privileges from the Data API roles
-- when they exist. On plain PostgreSQL these roles do not exist and this is a no-op.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    EXECUTE 'REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    EXECUTE 'REVOKE ALL ON ALL TABLES IN SCHEMA public FROM authenticated';
  END IF;
END $$;
