-- Yearly plans: how often a plan checkout and its subscription are billed.

ALTER TABLE checkouts ADD COLUMN billing_interval TEXT NOT NULL DEFAULT 'month' CHECK (billing_interval IN ('month', 'year'));
ALTER TABLE subscriptions ADD COLUMN billing_interval TEXT NOT NULL DEFAULT 'month' CHECK (billing_interval IN ('month', 'year'));
