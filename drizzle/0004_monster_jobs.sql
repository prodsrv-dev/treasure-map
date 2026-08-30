CREATE TABLE IF NOT EXISTS `monster_jobs` (
  `id` text PRIMARY KEY NOT NULL,
  `object_name` text NOT NULL,
  `location_name` text NOT NULL,
  `reference_key` text NOT NULL,
  `reference_type` text NOT NULL,
  `reference_name` text DEFAULT '' NOT NULL,
  `result_key` text,
  `result_type` text,
  `monster_name` text,
  `status` text DEFAULT 'pending' NOT NULL,
  `error` text,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_monster_jobs_pending`
ON `monster_jobs` (`status`, `created_at`)
WHERE `status` = 'pending';
