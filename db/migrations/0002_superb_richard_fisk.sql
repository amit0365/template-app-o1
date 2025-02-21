ALTER TABLE "profiles" ADD COLUMN "google_access_token" text;--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN "google_refresh_token" text;--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN "google_token_expires" timestamp;