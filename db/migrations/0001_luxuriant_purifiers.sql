CREATE TABLE "events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"event_title" text NOT NULL,
	"start_time" timestamp,
	"end_time" timestamp,
	"location" text,
	"external_link" text,
	"calendar_event_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sub_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"sub_event_name" text,
	"start_time" timestamp,
	"end_time" timestamp,
	"speaker" text,
	"topic" text,
	"location" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "sub_events" ADD CONSTRAINT "sub_events_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "events_user_calendar_id_unique" ON "events" USING btree ("user_id","calendar_event_id");--> statement-breakpoint
CREATE INDEX "sub_events_event_id_idx" ON "sub_events" USING btree ("event_id");