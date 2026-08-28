ALTER TABLE "review_events" ADD COLUMN "event_sequence" bigserial NOT NULL;--> statement-breakpoint
ALTER TABLE "review_events" ADD CONSTRAINT "review_events_event_sequence_unique" UNIQUE("event_sequence");
--> statement-breakpoint
GRANT USAGE, SELECT ON SEQUENCE "review_events_event_sequence_seq" TO hollis_app;
