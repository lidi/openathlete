-- AlterTable
ALTER TABLE "training_plan" ADD COLUMN "source_key" TEXT;
ALTER TABLE "training_plan" ADD COLUMN "source_schema_version" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "training_plan_athlete_id_source_key_key" ON "training_plan"("athlete_id", "source_key");
