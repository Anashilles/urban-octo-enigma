-- CreateTable
CREATE TABLE "tour_narrations" (
    "id" TEXT NOT NULL,
    "museumId" TEXT NOT NULL,
    "tourId" TEXT,
    "frameId" TEXT,
    "storageKey" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "durationMs" INTEGER NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tour_narrations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "tour_narrations_storageKey_key" ON "tour_narrations"("storageKey");

-- CreateIndex
CREATE INDEX "tour_narrations_museumId_idx" ON "tour_narrations"("museumId");

-- CreateIndex
CREATE UNIQUE INDEX "tour_narrations_tourId_frameId_key" ON "tour_narrations"("tourId", "frameId");

-- AddForeignKey
ALTER TABLE "tour_narrations" ADD CONSTRAINT "tour_narrations_museumId_fkey" FOREIGN KEY ("museumId") REFERENCES "museums"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tour_narrations" ADD CONSTRAINT "tour_narrations_tourId_fkey" FOREIGN KEY ("tourId") REFERENCES "guided_tours"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tour_narrations" ADD CONSTRAINT "tour_narrations_frameId_fkey" FOREIGN KEY ("frameId") REFERENCES "photo_frames"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tour_narrations" ADD CONSTRAINT "tour_narrations_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Row Level Security: application role only (see 20261019230327_enable_row_level_security).
ALTER TABLE "tour_narrations" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tour_narrations_application_only" ON "tour_narrations" AS RESTRICTIVE FOR ALL TO PUBLIC USING (false) WITH CHECK (false);
