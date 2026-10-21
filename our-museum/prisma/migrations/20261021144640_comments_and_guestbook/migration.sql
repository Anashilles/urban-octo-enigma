-- CreateTable
CREATE TABLE "photo_comments" (
    "id" TEXT NOT NULL,
    "museumId" TEXT NOT NULL,
    "photoId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "photo_comments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "guestbook_entries" (
    "id" TEXT NOT NULL,
    "museumId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "guestbook_entries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "photo_comments_photoId_createdAt_idx" ON "photo_comments"("photoId", "createdAt");

-- CreateIndex
CREATE INDEX "photo_comments_museumId_idx" ON "photo_comments"("museumId");

-- CreateIndex
CREATE INDEX "photo_comments_authorId_idx" ON "photo_comments"("authorId");

-- CreateIndex
CREATE INDEX "guestbook_entries_museumId_createdAt_idx" ON "guestbook_entries"("museumId", "createdAt");

-- CreateIndex
CREATE INDEX "guestbook_entries_authorId_idx" ON "guestbook_entries"("authorId");

-- AddForeignKey
ALTER TABLE "photo_comments" ADD CONSTRAINT "photo_comments_museumId_fkey" FOREIGN KEY ("museumId") REFERENCES "museums"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "photo_comments" ADD CONSTRAINT "photo_comments_photoId_fkey" FOREIGN KEY ("photoId") REFERENCES "photos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "photo_comments" ADD CONSTRAINT "photo_comments_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "guestbook_entries" ADD CONSTRAINT "guestbook_entries_museumId_fkey" FOREIGN KEY ("museumId") REFERENCES "museums"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "guestbook_entries" ADD CONSTRAINT "guestbook_entries_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Row Level Security: application role only (see 20261019230327_enable_row_level_security).
ALTER TABLE "photo_comments" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "photo_comments_application_only" ON "photo_comments" AS RESTRICTIVE FOR ALL TO PUBLIC USING (false) WITH CHECK (false);

ALTER TABLE "guestbook_entries" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "guestbook_entries_application_only" ON "guestbook_entries" AS RESTRICTIVE FOR ALL TO PUBLIC USING (false) WITH CHECK (false);
