CREATE TABLE `alerts` (
  `id` text PRIMARY KEY NOT NULL,
  `user_id` text NOT NULL,
  `condition_key` text NOT NULL,
  `payload` text NOT NULL,
  `enabled` integer DEFAULT 1 NOT NULL,
  `created_at` text NOT NULL,
  `updated_at` text NOT NULL,
  `check_token` text,
  `check_until` integer DEFAULT 0 NOT NULL,
  `last_attempt` integer DEFAULT 0 NOT NULL
);
CREATE UNIQUE INDEX `alerts_user_condition` ON `alerts` (`user_id`,`condition_key`);
CREATE INDEX `alerts_user` ON `alerts` (`user_id`);
CREATE TABLE `snapshots` (
  `alert_id` text PRIMARY KEY NOT NULL REFERENCES `alerts`(`id`) ON DELETE CASCADE,
  `user_id` text NOT NULL,
  `state` text NOT NULL,
  `checked_at` text NOT NULL
);
CREATE TABLE `notifications` (
  `id` text PRIMARY KEY NOT NULL,
  `user_id` text NOT NULL,
  `alert_id` text NOT NULL REFERENCES `alerts`(`id`) ON DELETE CASCADE,
  `event_key` text NOT NULL,
  `payload` text NOT NULL,
  `created_at` text NOT NULL
);
CREATE UNIQUE INDEX `notifications_user_event` ON `notifications` (`user_id`,`event_key`);
CREATE INDEX `notifications_user_time` ON `notifications` (`user_id`,`created_at`);
