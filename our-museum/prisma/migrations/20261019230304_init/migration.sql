-- CreateEnum
CREATE TYPE "MuseumRole" AS ENUM ('OWNER', 'EDITOR', 'VISITOR');

-- CreateEnum
CREATE TYPE "UploadStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "emailVerified" BOOLEAN NOT NULL DEFAULT false,
    "image" TEXT,
    "isAnonymous" BOOLEAN DEFAULT false,
    "locale" TEXT NOT NULL DEFAULT 'en',
    "preferences" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "token" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "userId" TEXT NOT NULL,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "accounts" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "accessToken" TEXT,
    "refreshToken" TEXT,
    "idToken" TEXT,
    "accessTokenExpiresAt" TIMESTAMP(3),
    "refreshTokenExpiresAt" TIMESTAMP(3),
    "scope" TEXT,
    "password" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "verifications" (
    "id" TEXT NOT NULL,
    "identifier" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "verifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rate_limits" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "count" INTEGER NOT NULL,
    "lastRequest" BIGINT NOT NULL,

    CONSTRAINT "rate_limits_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "museums" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "templateId" TEXT NOT NULL,
    "theme" JSONB NOT NULL DEFAULT '{}',
    "privacy" JSONB NOT NULL DEFAULT '{}',
    "coverPhotoId" TEXT,
    "layoutVersion" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "museums_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "museum_memberships" (
    "id" TEXT NOT NULL,
    "museumId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "MuseumRole" NOT NULL,
    "invitationId" TEXT,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "museum_memberships_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "museum_invitations" (
    "id" TEXT NOT NULL,
    "museumId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "invitedEmail" TEXT,
    "role" "MuseumRole" NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "maxUses" INTEGER NOT NULL,
    "uses" INTEGER NOT NULL DEFAULT 0,
    "revokedAt" TIMESTAMP(3),
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUsedAt" TIMESTAMP(3),

    CONSTRAINT "museum_invitations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "museum_visits" (
    "userId" TEXT NOT NULL,
    "museumId" TEXT NOT NULL,
    "lastVisitedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "visitCount" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "museum_visits_pkey" PRIMARY KEY ("userId","museumId")
);

-- CreateTable
CREATE TABLE "photos" (
    "id" TEXT NOT NULL,
    "museumId" TEXT NOT NULL,
    "uploadedById" TEXT,
    "storageKey" TEXT NOT NULL,
    "largeKey" TEXT NOT NULL,
    "mediumKey" TEXT NOT NULL,
    "thumbnailKey" TEXT NOT NULL,
    "originalFilename" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "dominantColor" TEXT NOT NULL DEFAULT '#d8d2c6',
    "title" TEXT NOT NULL DEFAULT '',
    "caption" TEXT NOT NULL DEFAULT '',
    "takenAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "photos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pending_uploads" (
    "id" TEXT NOT NULL,
    "museumId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "incomingKey" TEXT NOT NULL,
    "originalFilename" TEXT NOT NULL,
    "declaredMimeType" TEXT NOT NULL,
    "declaredSize" INTEGER NOT NULL,
    "status" "UploadStatus" NOT NULL DEFAULT 'PENDING',
    "error" TEXT,
    "photoId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pending_uploads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "storage_deletions" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "storage_deletions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "photo_collections" (
    "id" TEXT NOT NULL,
    "museumId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "photo_collections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "collection_photos" (
    "collectionId" TEXT NOT NULL,
    "photoId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "addedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "collection_photos_pkey" PRIMARY KEY ("collectionId","photoId")
);

-- CreateTable
CREATE TABLE "photo_favorites" (
    "userId" TEXT NOT NULL,
    "photoId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "photo_favorites_pkey" PRIMARY KEY ("userId","photoId")
);

-- CreateTable
CREATE TABLE "photo_reactions" (
    "id" TEXT NOT NULL,
    "photoId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "emoji" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "photo_reactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "museum_rooms" (
    "id" TEXT NOT NULL,
    "museumId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "roomType" TEXT NOT NULL,
    "width" DOUBLE PRECISION NOT NULL,
    "depth" DOUBLE PRECISION NOT NULL,
    "height" DOUBLE PRECISION NOT NULL,
    "positionX" DOUBLE PRECISION NOT NULL,
    "positionZ" DOUBLE PRECISION NOT NULL,
    "rotation" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "layout" JSONB NOT NULL DEFAULT '{}',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "museum_rooms_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "museum_walls" (
    "id" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "wallKey" TEXT NOT NULL,
    "length" DOUBLE PRECISION NOT NULL,
    "height" DOUBLE PRECISION NOT NULL,
    "transform" JSONB NOT NULL,
    "bounds" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "museum_walls_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "photo_frames" (
    "id" TEXT NOT NULL,
    "museumId" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "wallId" TEXT NOT NULL,
    "photoId" TEXT NOT NULL,
    "positionU" DOUBLE PRECISION NOT NULL,
    "positionV" DOUBLE PRECISION NOT NULL,
    "rotation" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "width" DOUBLE PRECISION NOT NULL,
    "height" DOUBLE PRECISION NOT NULL,
    "frameStyle" TEXT NOT NULL,
    "frameOptions" JSONB NOT NULL DEFAULT '{}',
    "caption" TEXT,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "photo_frames_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "avatar_profiles" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "modelId" TEXT NOT NULL,
    "config" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "avatar_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "guided_tours" (
    "id" TEXT NOT NULL,
    "museumId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "guided_tours_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tour_stops" (
    "id" TEXT NOT NULL,
    "tourId" TEXT NOT NULL,
    "frameId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL,
    "note" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "tour_stops_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "museum_events" (
    "id" TEXT NOT NULL,
    "museumId" TEXT,
    "actorId" TEXT,
    "eventType" TEXT NOT NULL,
    "entityId" TEXT,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "museum_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_token_key" ON "sessions"("token");

-- CreateIndex
CREATE INDEX "sessions_userId_idx" ON "sessions"("userId");

-- CreateIndex
CREATE INDEX "accounts_userId_idx" ON "accounts"("userId");

-- CreateIndex
CREATE INDEX "verifications_identifier_idx" ON "verifications"("identifier");

-- CreateIndex
CREATE UNIQUE INDEX "rate_limits_key_key" ON "rate_limits"("key");

-- CreateIndex
CREATE UNIQUE INDEX "museums_coverPhotoId_key" ON "museums"("coverPhotoId");

-- CreateIndex
CREATE INDEX "museums_ownerId_idx" ON "museums"("ownerId");

-- CreateIndex
CREATE INDEX "museum_memberships_userId_idx" ON "museum_memberships"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "museum_memberships_museumId_userId_key" ON "museum_memberships"("museumId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "museum_invitations_tokenHash_key" ON "museum_invitations"("tokenHash");

-- CreateIndex
CREATE INDEX "museum_invitations_museumId_idx" ON "museum_invitations"("museumId");

-- CreateIndex
CREATE INDEX "museum_visits_userId_lastVisitedAt_idx" ON "museum_visits"("userId", "lastVisitedAt");

-- CreateIndex
CREATE UNIQUE INDEX "photos_storageKey_key" ON "photos"("storageKey");

-- CreateIndex
CREATE UNIQUE INDEX "photos_largeKey_key" ON "photos"("largeKey");

-- CreateIndex
CREATE UNIQUE INDEX "photos_mediumKey_key" ON "photos"("mediumKey");

-- CreateIndex
CREATE UNIQUE INDEX "photos_thumbnailKey_key" ON "photos"("thumbnailKey");

-- CreateIndex
CREATE INDEX "photos_museumId_createdAt_idx" ON "photos"("museumId", "createdAt");

-- CreateIndex
CREATE INDEX "photos_museumId_takenAt_idx" ON "photos"("museumId", "takenAt");

-- CreateIndex
CREATE UNIQUE INDEX "pending_uploads_incomingKey_key" ON "pending_uploads"("incomingKey");

-- CreateIndex
CREATE INDEX "pending_uploads_status_expiresAt_idx" ON "pending_uploads"("status", "expiresAt");

-- CreateIndex
CREATE INDEX "pending_uploads_museumId_idx" ON "pending_uploads"("museumId");

-- CreateIndex
CREATE INDEX "storage_deletions_nextAttemptAt_idx" ON "storage_deletions"("nextAttemptAt");

-- CreateIndex
CREATE INDEX "photo_collections_museumId_sortOrder_idx" ON "photo_collections"("museumId", "sortOrder");

-- CreateIndex
CREATE INDEX "collection_photos_photoId_idx" ON "collection_photos"("photoId");

-- CreateIndex
CREATE INDEX "photo_favorites_photoId_idx" ON "photo_favorites"("photoId");

-- CreateIndex
CREATE UNIQUE INDEX "photo_reactions_photoId_userId_emoji_key" ON "photo_reactions"("photoId", "userId", "emoji");

-- CreateIndex
CREATE INDEX "museum_rooms_museumId_sortOrder_idx" ON "museum_rooms"("museumId", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "museum_walls_roomId_wallKey_key" ON "museum_walls"("roomId", "wallKey");

-- CreateIndex
CREATE INDEX "photo_frames_museumId_idx" ON "photo_frames"("museumId");

-- CreateIndex
CREATE INDEX "photo_frames_wallId_idx" ON "photo_frames"("wallId");

-- CreateIndex
CREATE INDEX "photo_frames_photoId_idx" ON "photo_frames"("photoId");

-- CreateIndex
CREATE INDEX "photo_frames_roomId_idx" ON "photo_frames"("roomId");

-- CreateIndex
CREATE UNIQUE INDEX "avatar_profiles_userId_key" ON "avatar_profiles"("userId");

-- CreateIndex
CREATE INDEX "guided_tours_museumId_idx" ON "guided_tours"("museumId");

-- CreateIndex
CREATE INDEX "tour_stops_tourId_sortOrder_idx" ON "tour_stops"("tourId", "sortOrder");

-- CreateIndex
CREATE INDEX "museum_events_museumId_createdAt_idx" ON "museum_events"("museumId", "createdAt");

-- CreateIndex
CREATE INDEX "museum_events_eventType_createdAt_idx" ON "museum_events"("eventType", "createdAt");

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "museums" ADD CONSTRAINT "museums_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "museums" ADD CONSTRAINT "museums_coverPhotoId_fkey" FOREIGN KEY ("coverPhotoId") REFERENCES "photos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "museum_memberships" ADD CONSTRAINT "museum_memberships_museumId_fkey" FOREIGN KEY ("museumId") REFERENCES "museums"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "museum_memberships" ADD CONSTRAINT "museum_memberships_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "museum_memberships" ADD CONSTRAINT "museum_memberships_invitationId_fkey" FOREIGN KEY ("invitationId") REFERENCES "museum_invitations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "museum_invitations" ADD CONSTRAINT "museum_invitations_museumId_fkey" FOREIGN KEY ("museumId") REFERENCES "museums"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "museum_invitations" ADD CONSTRAINT "museum_invitations_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "museum_visits" ADD CONSTRAINT "museum_visits_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "museum_visits" ADD CONSTRAINT "museum_visits_museumId_fkey" FOREIGN KEY ("museumId") REFERENCES "museums"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "photos" ADD CONSTRAINT "photos_museumId_fkey" FOREIGN KEY ("museumId") REFERENCES "museums"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "photos" ADD CONSTRAINT "photos_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pending_uploads" ADD CONSTRAINT "pending_uploads_museumId_fkey" FOREIGN KEY ("museumId") REFERENCES "museums"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pending_uploads" ADD CONSTRAINT "pending_uploads_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "photo_collections" ADD CONSTRAINT "photo_collections_museumId_fkey" FOREIGN KEY ("museumId") REFERENCES "museums"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "collection_photos" ADD CONSTRAINT "collection_photos_collectionId_fkey" FOREIGN KEY ("collectionId") REFERENCES "photo_collections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "collection_photos" ADD CONSTRAINT "collection_photos_photoId_fkey" FOREIGN KEY ("photoId") REFERENCES "photos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "photo_favorites" ADD CONSTRAINT "photo_favorites_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "photo_favorites" ADD CONSTRAINT "photo_favorites_photoId_fkey" FOREIGN KEY ("photoId") REFERENCES "photos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "photo_reactions" ADD CONSTRAINT "photo_reactions_photoId_fkey" FOREIGN KEY ("photoId") REFERENCES "photos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "photo_reactions" ADD CONSTRAINT "photo_reactions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "museum_rooms" ADD CONSTRAINT "museum_rooms_museumId_fkey" FOREIGN KEY ("museumId") REFERENCES "museums"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "museum_walls" ADD CONSTRAINT "museum_walls_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "museum_rooms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "photo_frames" ADD CONSTRAINT "photo_frames_museumId_fkey" FOREIGN KEY ("museumId") REFERENCES "museums"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "photo_frames" ADD CONSTRAINT "photo_frames_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "museum_rooms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "photo_frames" ADD CONSTRAINT "photo_frames_wallId_fkey" FOREIGN KEY ("wallId") REFERENCES "museum_walls"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "photo_frames" ADD CONSTRAINT "photo_frames_photoId_fkey" FOREIGN KEY ("photoId") REFERENCES "photos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "photo_frames" ADD CONSTRAINT "photo_frames_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "avatar_profiles" ADD CONSTRAINT "avatar_profiles_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "guided_tours" ADD CONSTRAINT "guided_tours_museumId_fkey" FOREIGN KEY ("museumId") REFERENCES "museums"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "guided_tours" ADD CONSTRAINT "guided_tours_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tour_stops" ADD CONSTRAINT "tour_stops_tourId_fkey" FOREIGN KEY ("tourId") REFERENCES "guided_tours"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tour_stops" ADD CONSTRAINT "tour_stops_frameId_fkey" FOREIGN KEY ("frameId") REFERENCES "photo_frames"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "museum_events" ADD CONSTRAINT "museum_events_museumId_fkey" FOREIGN KEY ("museumId") REFERENCES "museums"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "museum_events" ADD CONSTRAINT "museum_events_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
