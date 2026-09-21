ALTER TABLE "review_cases" ADD COLUMN "known_limitations" text;

ALTER TYPE "review_event_type" ADD VALUE IF NOT EXISTS 'decision_packet_acknowledged';

ALTER TABLE "review_cases"
  ADD CONSTRAINT "review_cases_known_limitations_when_completed"
  CHECK (status <> 'completed' OR known_limitations IS NOT NULL) NOT VALID;
