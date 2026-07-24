-- Explicit "not done" state for planned sessions (used for analytics)
ALTER TABLE "event_training" ADD COLUMN "not_fulfilled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "event_competition" ADD COLUMN "not_fulfilled" BOOLEAN NOT NULL DEFAULT false;
