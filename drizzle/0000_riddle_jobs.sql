CREATE TABLE `riddle_jobs` (
  `id` text PRIMARY KEY NOT NULL,
  `answer` text NOT NULL,
  `properties` text NOT NULL,
  `age` text NOT NULL,
  `language` text NOT NULL,
  `format` text NOT NULL,
  `tone` text NOT NULL,
  `status` text DEFAULT 'pending' NOT NULL,
  `result` text,
  `error` text,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `riddle_jobs_status_created_idx` ON `riddle_jobs` (`status`, `created_at`);
