CREATE TABLE `keyword_queries` (
  `id` text PRIMARY KEY NOT NULL,
  `query` text NOT NULL,
  `translation` text NOT NULL,
  `language` text NOT NULL,
  `country` text NOT NULL,
  `category` text NOT NULL,
  `intent` text NOT NULL,
  `trend_five_years` integer,
  `trend_twelve_months` integer,
  `season` text DEFAULT 'Круглый год' NOT NULL,
  `status` text DEFAULT 'К проверке' NOT NULL,
  `priority` text DEFAULT 'Средний' NOT NULL,
  `notes` text DEFAULT '' NOT NULL,
  `source_url` text DEFAULT '' NOT NULL,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `keyword_queries_scope_idx` ON `keyword_queries` (`query`, `language`, `country`);
--> statement-breakpoint
CREATE INDEX `keyword_queries_status_priority_idx` ON `keyword_queries` (`status`, `priority`);
--> statement-breakpoint
CREATE INDEX `keyword_queries_category_idx` ON `keyword_queries` (`category`);
