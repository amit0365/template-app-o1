/*
Defines the database schema for profiles.
*/

import { pgEnum, pgTable, text, timestamp } from "drizzle-orm/pg-core"

export const membershipEnum = pgEnum("membership", ["free", "pro"])

export const profilesTable = pgTable("profiles", {
  /**
   * The unique userId from Clerk. This is our primary key to link a profile to a user.
   */
  userId: text("user_id").primaryKey().notNull(),

  /**
   * Membership status to control access to certain features (e.g., "free" or "pro").
   */
  membership: membershipEnum("membership").notNull().default("free"),

  /**
   * Stripe-related columns for subscription management.
   */
  stripeCustomerId: text("stripe_customer_id"),
  stripeSubscriptionId: text("stripe_subscription_id"),

  /**
   * Google OAuth tokens for read-only Calendar access.
   * - googleAccessToken: Short-lived token
   * - googleRefreshToken: Used to refresh the short-lived token
   * - googleTokenExpires: Expiration time for the short-lived token
   */
  googleAccessToken: text("google_access_token"),
  googleRefreshToken: text("google_refresh_token"),
  googleTokenExpires: timestamp("google_token_expires"),

  /**
   * Automatic timestamps for record creation and updates.
   */
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at")
    .defaultNow()
    .notNull()
    .$onUpdate(() => new Date())
})

export type InsertProfile = typeof profilesTable.$inferInsert
export type SelectProfile = typeof profilesTable.$inferSelect
