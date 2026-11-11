CREATE TABLE `cms_preview_links` (
	`id` text PRIMARY KEY NOT NULL,
	`token_hash` text NOT NULL,
	`entry` text NOT NULL,
	`item_id` text NOT NULL,
	`locale` text,
	`created_by` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`expires_at` text NOT NULL,
	`revoked_at` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `cms_preview_links_token_hash_unique` ON `cms_preview_links` (`token_hash`);--> statement-breakpoint
CREATE TABLE `cms_redirects` (
	`id` text PRIMARY KEY NOT NULL,
	`from_path` text NOT NULL,
	`to_path` text NOT NULL,
	`status` integer DEFAULT 301 NOT NULL,
	`keep_query` integer DEFAULT true NOT NULL,
	`source` text DEFAULT 'manual' NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `cms_redirects_from_path_unique` ON `cms_redirects` (`from_path`);--> statement-breakpoint
CREATE TABLE `footer` (
	`id` text PRIMARY KEY NOT NULL,
	`menu` text,
	`privacy` text,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL
);
--> statement-breakpoint
ALTER TABLE `blog` ADD `seo_noindex` integer;--> statement-breakpoint
ALTER TABLE `news` ADD `seo_noindex` integer;