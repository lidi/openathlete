-- CreateTable
CREATE TABLE "google_drive_connection" (
    "google_drive_connection_id" SERIAL NOT NULL,
    "access_token" TEXT,
    "refresh_token" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3),
    "scope" TEXT,
    "last_sync_at" TIMESTAMP(3),
    "athlete_id" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "google_drive_connection_pkey" PRIMARY KEY ("google_drive_connection_id")
);

-- CreateTable
CREATE TABLE "google_drive_imported_file" (
    "google_drive_imported_file_id" SERIAL NOT NULL,
    "drive_file_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "mime_type" TEXT,
    "modified_time" TIMESTAMP(3),
    "md5_checksum" TEXT,
    "event_id" INTEGER,
    "imported_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "google_drive_connection_id" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "google_drive_imported_file_pkey" PRIMARY KEY ("google_drive_imported_file_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "google_drive_connection_athlete_id_key" ON "google_drive_connection"("athlete_id");

-- CreateIndex
CREATE INDEX "google_drive_imported_file_drive_file_id_idx" ON "google_drive_imported_file"("drive_file_id");

-- CreateIndex
CREATE INDEX "google_drive_imported_file_event_id_idx" ON "google_drive_imported_file"("event_id");

-- CreateIndex
CREATE UNIQUE INDEX "google_drive_imported_file_google_drive_connection_id_drive_file_id_key" ON "google_drive_imported_file"("google_drive_connection_id", "drive_file_id");

-- AddForeignKey
ALTER TABLE "google_drive_connection" ADD CONSTRAINT "google_drive_connection_athlete_id_fkey" FOREIGN KEY ("athlete_id") REFERENCES "athlete"("athlete_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "google_drive_imported_file" ADD CONSTRAINT "google_drive_imported_file_google_drive_connection_id_fkey" FOREIGN KEY ("google_drive_connection_id") REFERENCES "google_drive_connection"("google_drive_connection_id") ON DELETE CASCADE ON UPDATE CASCADE;
